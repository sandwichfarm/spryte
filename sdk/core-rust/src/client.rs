use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use uniffi;

use crate::error::SpryteCvmError;
use crate::protocol;
use crate::signer::{NostrSigner, PrivateKeySigner};
use crate::transport::{NostrTransport, ProgressCallback};
use crate::types::*;

/// High-level client for interacting with the Spryte CVM.
///
/// Provides typed methods for each CVM tool call, handling serialization,
/// relay communication, and response parsing.
#[derive(uniffi::Object)]
pub struct SpryteCvmClient {
    transport: NostrTransport,
    config: ClientConfig,
}

#[uniffi::export]
impl SpryteCvmClient {
    /// Create a client with a custom signer implementation.
    #[uniffi::constructor]
    pub fn new(signer: Arc<dyn NostrSigner>, config: ClientConfig) -> Self {
        let transport = NostrTransport::new(signer, config.server_pubkey.clone());
        Self { transport, config }
    }

    /// Create a client with a built-in private key signer.
    #[uniffi::constructor]
    pub fn with_private_key(
        secret_key: String,
        config: ClientConfig,
    ) -> Result<Self, SpryteCvmError> {
        let signer = PrivateKeySigner::new(secret_key)?;
        let transport = NostrTransport::new(signer, config.server_pubkey.clone());
        Ok(Self { transport, config })
    }

    /// Connect to the configured relays.
    pub async fn connect(&self) -> Result<(), SpryteCvmError> {
        self.transport.connect(self.config.relays.clone()).await
    }

    /// Disconnect from all relays.
    pub async fn disconnect(&self) -> Result<(), SpryteCvmError> {
        self.transport.disconnect().await
    }

    /// Generate a sprite sheet for a Nostr pubkey.
    ///
    /// This is a long-running operation (up to 5 minutes) that supports
    /// progress callbacks.
    pub async fn generate_spryte(
        &self,
        input: GenerateSpryteInput,
        progress: Option<Box<dyn ProgressCallback>>,
    ) -> Result<GenerateSpryteOutput, SpryteCvmError> {
        let mut args = json!({ "pubkey": input.pubkey });
        if let Some(cs) = input.cell_size {
            args["cellSize"] = json!(cs);
        }
        if let Some(ref us) = input.upload_server {
            args["uploadServer"] = json!(us);
        }
        if let Some(ri) = input.request_invoice {
            args["requestInvoice"] = json!(ri);
        }

        let request_id = uuid::Uuid::new_v4().to_string();
        let mcp_json = protocol::build_mcp_request(&request_id, "generate-spryte", args);

        let timeout = Duration::from_secs(5 * 60); // 5 minutes
        let response = self
            .transport
            .send_request(&mcp_json, timeout, progress)
            .await?;

        let mcp_result = protocol::parse_mcp_response(&response)
            .map_err(|reason| SpryteCvmError::CvmError { reason })?;

        let tool_result = protocol::extract_tool_result(&mcp_result)
            .map_err(|reason| SpryteCvmError::InvalidResponse { reason })?;

        parse_generate_spryte_output(&tool_result)
    }

    /// Get available subscription plans and pricing.
    pub async fn get_plans(&self) -> Result<PlansOutput, SpryteCvmError> {
        let request_id = uuid::Uuid::new_v4().to_string();
        let mcp_json = protocol::build_mcp_request(&request_id, "get-plans", json!({}));

        let timeout_secs = self.config.timeout_secs.unwrap_or(30);
        let timeout = Duration::from_secs(timeout_secs);
        let response = self.transport.send_request(&mcp_json, timeout, None).await?;

        let mcp_result = protocol::parse_mcp_response(&response)
            .map_err(|reason| SpryteCvmError::CvmError { reason })?;

        let tool_result = protocol::extract_tool_result(&mcp_result)
            .map_err(|reason| SpryteCvmError::InvalidResponse { reason })?;

        Ok(PlansOutput {
            json: tool_result.to_string(),
        })
    }

    /// Subscribe to a paid plan.
    pub async fn subscribe(
        &self,
        input: SubscribeInput,
    ) -> Result<SubscribeOutput, SpryteCvmError> {
        let args = json!({
            "planId": input.plan_id,
            "period": input.period,
        });

        let request_id = uuid::Uuid::new_v4().to_string();
        let mcp_json = protocol::build_mcp_request(&request_id, "subscribe", args);

        let timeout = Duration::from_secs(60);
        let response = self.transport.send_request(&mcp_json, timeout, None).await?;

        let mcp_result = protocol::parse_mcp_response(&response)
            .map_err(|reason| SpryteCvmError::CvmError { reason })?;

        let tool_result = protocol::extract_tool_result(&mcp_result)
            .map_err(|reason| SpryteCvmError::InvalidResponse { reason })?;

        parse_subscribe_output(&tool_result)
    }
}

fn parse_generate_spryte_output(
    value: &serde_json::Value,
) -> Result<GenerateSpryteOutput, SpryteCvmError> {
    Ok(GenerateSpryteOutput {
        sprite_url: value
            .get("spriteUrl")
            .and_then(|v| v.as_str())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'spriteUrl' in response".to_string(),
            })?
            .to_string(),
        mapping_url: value
            .get("mappingUrl")
            .and_then(|v| v.as_str())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'mappingUrl' in response".to_string(),
            })?
            .to_string(),
        pubkey_count: value
            .get("pubkeyCount")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'pubkeyCount' in response".to_string(),
            })? as u32,
        cell_size: value
            .get("cellSize")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'cellSize' in response".to_string(),
            })? as u32,
        cached: value.get("cached").and_then(|v| v.as_bool()),
        limit_reasons: value.get("limitReasons").and_then(|v| {
            v.as_array().map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect()
            })
        }),
        total_followers: value
            .get("totalFollowers")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
    })
}

fn parse_subscribe_output(
    value: &serde_json::Value,
) -> Result<SubscribeOutput, SpryteCvmError> {
    Ok(SubscribeOutput {
        subscribed: value
            .get("subscribed")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'subscribed' in response".to_string(),
            })?,
        plan_id: value
            .get("planId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'planId' in response".to_string(),
            })?
            .to_string(),
        period: value
            .get("period")
            .and_then(|v| v.as_str())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'period' in response".to_string(),
            })?
            .to_string(),
        expires_at: value
            .get("expiresAt")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'expiresAt' in response".to_string(),
            })?,
        expires_at_iso: value
            .get("expiresAtISO")
            .and_then(|v| v.as_str())
            .ok_or_else(|| SpryteCvmError::InvalidResponse {
                reason: "Missing 'expiresAtISO' in response".to_string(),
            })?
            .to_string(),
    })
}
