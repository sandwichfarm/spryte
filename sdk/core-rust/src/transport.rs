use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use nostr_sdk::prelude::*;
use serde_json::Value;
use tokio::sync::{oneshot, Mutex};

use crate::error::SpryteCvmError;
use crate::protocol::{
    self, KIND_MCP_RESPONSE, KIND_PAYMENT_REQUIRED, KIND_PROGRESS,
};
use crate::signer::NostrSigner;
use crate::types::ProgressInfo;

/// Callback trait for receiving progress notifications.
#[uniffi::export(callback_interface)]
pub trait ProgressCallback: Send + Sync {
    fn on_progress(&self, info: ProgressInfo);
}

/// Pending request entry: final response sender + optional progress callback.
struct PendingRequest {
    sender: oneshot::Sender<Result<String, SpryteCvmError>>,
    progress_cb: Option<Box<dyn ProgressCallback>>,
}

/// Manages Nostr relay connections, event sending/receiving, and response correlation.
pub struct NostrTransport {
    client: Client,
    signer: Arc<dyn NostrSigner>,
    server_pubkey: String,
    pending: Arc<Mutex<HashMap<EventId, PendingRequest>>>,
    connected: Arc<Mutex<bool>>,
}

impl NostrTransport {
    pub fn new(signer: Arc<dyn NostrSigner>, server_pubkey: String) -> Self {
        Self {
            client: Client::default(),
            signer,
            server_pubkey,
            pending: Arc::new(Mutex::new(HashMap::new())),
            connected: Arc::new(Mutex::new(false)),
        }
    }

    /// Connect to relays and start listening for response events.
    pub async fn connect(&self, relays: Vec<String>) -> Result<(), SpryteCvmError> {
        for relay_url in &relays {
            self.client
                .add_relay(relay_url.as_str())
                .await
                .map_err(|e| SpryteCvmError::ConnectionFailed {
                    reason: format!("Failed to add relay {relay_url}: {e}"),
                })?;
        }

        self.client.connect().await;

        // Get our pubkey to filter incoming events addressed to us
        let our_pubkey = self.signer.get_public_key().await?;
        let our_pk =
            PublicKey::parse(&our_pubkey).map_err(|e| SpryteCvmError::SignerError {
                reason: format!("Invalid signer public key: {e}"),
            })?;
        let server_pk = PublicKey::parse(&self.server_pubkey).map_err(|e| {
            SpryteCvmError::ConnectionFailed {
                reason: format!("Invalid server pubkey: {e}"),
            }
        })?;

        // Subscribe to response kinds from the server, addressed to us
        let filter = Filter::new()
            .kinds(vec![
                Kind::from(KIND_MCP_RESPONSE),
                Kind::from(KIND_PROGRESS),
                Kind::from(KIND_PAYMENT_REQUIRED),
            ])
            .author(server_pk)
            .pubkey(our_pk)
            .since(Timestamp::now());

        self.client
            .subscribe(filter, None)
            .await
            .map_err(|e| SpryteCvmError::ConnectionFailed {
                reason: format!("Failed to subscribe: {e}"),
            })?;

        // Start the notification handler loop
        let pending = self.pending.clone();
        let signer = self.signer.clone();
        let server_pubkey = self.server_pubkey.clone();
        let client = self.client.clone();

        tokio::spawn(async move {
            handle_notifications(client, pending, signer, server_pubkey).await;
        });

        *self.connected.lock().await = true;
        Ok(())
    }

    /// Disconnect from all relays.
    pub async fn disconnect(&self) -> Result<(), SpryteCvmError> {
        self.client.disconnect().await;
        *self.connected.lock().await = false;
        Ok(())
    }

    /// Send an MCP request and wait for the correlated response.
    pub async fn send_request(
        &self,
        mcp_json: &str,
        timeout: Duration,
        progress_cb: Option<Box<dyn ProgressCallback>>,
    ) -> Result<String, SpryteCvmError> {
        if !*self.connected.lock().await {
            return Err(SpryteCvmError::NotConnected {
                reason: "Not connected to any relay".to_string(),
            });
        }

        // Encrypt the MCP JSON with NIP-44
        let encrypted = self
            .signer
            .nip44_encrypt(self.server_pubkey.clone(), mcp_json.to_string())
            .await?;

        // Build the kind 25910 event
        let server_pk = PublicKey::parse(&self.server_pubkey).map_err(|e| {
            SpryteCvmError::SignerError {
                reason: format!("Invalid server pubkey: {e}"),
            }
        })?;

        let created_at = Timestamp::now();
        let tags = vec![vec!["p".to_string(), server_pk.to_hex()]];

        let event_template = serde_json::json!({
            "kind": protocol::KIND_CLIENT_REQUEST,
            "created_at": created_at.as_u64(),
            "tags": tags,
            "content": encrypted
        });

        // Sign the event via our signer
        let signed_json = self
            .signer
            .sign_event(event_template.to_string())
            .await?;

        let signed_event: Value =
            serde_json::from_str(&signed_json).map_err(|e| SpryteCvmError::SignerError {
                reason: format!("Failed to parse signed event: {e}"),
            })?;

        let event_id_hex = signed_event
            .get("id")
            .and_then(|id| id.as_str())
            .ok_or_else(|| SpryteCvmError::SignerError {
                reason: "Signed event missing 'id'".to_string(),
            })?;

        let event_id =
            EventId::parse(event_id_hex).map_err(|e| SpryteCvmError::SignerError {
                reason: format!("Invalid event ID: {e}"),
            })?;

        // Reconstruct as nostr_sdk Event for publishing
        let event = Event::from_json(&signed_json).map_err(|e| SpryteCvmError::SignerError {
            reason: format!("Failed to reconstruct event: {e}"),
        })?;

        // Register pending request before publishing
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(
                event_id,
                PendingRequest {
                    sender: tx,
                    progress_cb,
                },
            );
        }

        // Publish the event
        self.client
            .send_event(event)
            .await
            .map_err(|e| SpryteCvmError::RelayError {
                reason: format!("Failed to publish event: {e}"),
            })?;

        // Wait for response with timeout
        let result = tokio::time::timeout(timeout, rx)
            .await
            .map_err(|_| {
                // Clean up pending entry on timeout
                let pending = self.pending.clone();
                let eid = event_id;
                tokio::spawn(async move {
                    pending.lock().await.remove(&eid);
                });
                SpryteCvmError::Timeout {
                    reason: format!("Request timed out after {}s", timeout.as_secs()),
                }
            })?
            .map_err(|_| SpryteCvmError::InvalidResponse {
                reason: "Response channel closed unexpectedly".to_string(),
            })?;

        result
    }
}

/// Background loop that handles incoming Nostr notifications and routes them
/// to the appropriate pending request.
async fn handle_notifications(
    client: Client,
    pending: Arc<Mutex<HashMap<EventId, PendingRequest>>>,
    signer: Arc<dyn NostrSigner>,
    server_pubkey: String,
) {
    let mut notifications = client.notifications();

    loop {
        match notifications.recv().await {
            Ok(notification) => {
                if let RelayPoolNotification::Event { event, .. } = notification {
                    let kind_u16 = event.kind.as_u16();

                    // Find the request ID this response correlates to via "e" tag
                    let request_event_id = event
                        .tags
                        .iter()
                        .find_map(|tag| {
                            let values: Vec<&str> = tag.as_slice().iter().map(|s| s.as_str()).collect();
                            if values.first() == Some(&"e") {
                                values.get(1).and_then(|id| EventId::parse(*id).ok())
                            } else {
                                None
                            }
                        });

                    let request_event_id = match request_event_id {
                        Some(id) => id,
                        None => continue, // No "e" tag, skip
                    };

                    // Decrypt the content
                    let decrypted = match signer
                        .nip44_decrypt(server_pubkey.clone(), event.content.to_string())
                        .await
                    {
                        Ok(d) => d,
                        Err(e) => {
                            log::warn!("Failed to decrypt event: {e}");
                            continue;
                        }
                    };

                    match kind_u16 {
                        k if k == KIND_PROGRESS => {
                            // Deliver progress to callback if registered
                            let pending_guard = pending.lock().await;
                            if let Some(req) = pending_guard.get(&request_event_id) {
                                if let Some(ref cb) = req.progress_cb {
                                    if let Some(info) = protocol::parse_progress(&decrypted) {
                                        cb.on_progress(info);
                                    }
                                }
                            }
                        }
                        k if k == KIND_MCP_RESPONSE => {
                            // Final response — remove from pending and send
                            let mut pending_guard = pending.lock().await;
                            if let Some(req) = pending_guard.remove(&request_event_id) {
                                let _ = req.sender.send(Ok(decrypted));
                            }
                        }
                        k if k == KIND_PAYMENT_REQUIRED => {
                            // Payment required — not supported in this phase
                            let mut pending_guard = pending.lock().await;
                            if let Some(req) = pending_guard.remove(&request_event_id) {
                                let _ = req.sender.send(Err(SpryteCvmError::PaymentRequired {
                                    reason: decrypted,
                                }));
                            }
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                log::warn!("Notification channel error: {e}");
                break;
            }
        }
    }
}
