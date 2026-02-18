use std::sync::Arc;

use async_trait::async_trait;
use nostr_sdk::prelude::*;
use uniffi;

use crate::error::SpryteCvmError;

/// Trait for Nostr event signing and NIP-44 encryption.
///
/// All methods use JSON strings to avoid complex FFI types for tags.
/// Foreign implementations deserialize with their platform JSON libs.
#[uniffi::export(with_foreign)]
#[async_trait]
pub trait NostrSigner: Send + Sync {
    /// Returns the signer's public key as a hex string.
    async fn get_public_key(&self) -> Result<String, SpryteCvmError>;

    /// Signs a Nostr event given as a JSON string.
    ///
    /// Input JSON contains: `{ "kind", "created_at", "tags", "content" }`
    /// Returns the full signed event as JSON with `id`, `sig`, `pubkey` added.
    async fn sign_event(&self, event_json: String) -> Result<String, SpryteCvmError>;

    /// NIP-44 encrypt plaintext for the given pubkey.
    async fn nip44_encrypt(
        &self,
        pubkey: String,
        plaintext: String,
    ) -> Result<String, SpryteCvmError>;

    /// NIP-44 decrypt ciphertext from the given pubkey.
    async fn nip44_decrypt(
        &self,
        pubkey: String,
        ciphertext: String,
    ) -> Result<String, SpryteCvmError>;
}

/// Built-in signer using a private key. Wraps `nostr_sdk::Keys`.
#[derive(uniffi::Object)]
pub struct PrivateKeySigner {
    keys: Keys,
}

#[uniffi::export]
impl PrivateKeySigner {
    /// Create a signer from a hex-encoded secret key.
    #[uniffi::constructor]
    pub fn new(secret_key: String) -> Result<Arc<Self>, SpryteCvmError> {
        let sk = SecretKey::parse(&secret_key).map_err(|e| SpryteCvmError::SignerError {
            reason: format!("Invalid secret key: {e}"),
        })?;
        let keys = Keys::new(sk);
        Ok(Arc::new(Self { keys }))
    }

    /// Generate a new random keypair.
    #[uniffi::constructor]
    pub fn generate() -> Arc<Self> {
        Arc::new(Self {
            keys: Keys::generate(),
        })
    }

    /// Returns the public key as a hex string.
    pub fn public_key_hex(&self) -> String {
        self.keys.public_key().to_hex()
    }
}

#[async_trait]
impl NostrSigner for PrivateKeySigner {
    async fn get_public_key(&self) -> Result<String, SpryteCvmError> {
        Ok(self.keys.public_key().to_hex())
    }

    async fn sign_event(&self, event_json: String) -> Result<String, SpryteCvmError> {
        let template: serde_json::Value =
            serde_json::from_str(&event_json).map_err(|e| SpryteCvmError::SignerError {
                reason: format!("Invalid event JSON: {e}"),
            })?;

        let kind_num = template
            .get("kind")
            .and_then(|k| k.as_u64())
            .ok_or_else(|| SpryteCvmError::SignerError {
                reason: "Missing 'kind' in event template".to_string(),
            })?;

        let created_at = template
            .get("created_at")
            .and_then(|c| c.as_u64())
            .ok_or_else(|| SpryteCvmError::SignerError {
                reason: "Missing 'created_at' in event template".to_string(),
            })?;

        let content = template
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        let tags_json = template
            .get("tags")
            .and_then(|t| t.as_array())
            .ok_or_else(|| SpryteCvmError::SignerError {
                reason: "Missing 'tags' in event template".to_string(),
            })?;

        let mut tags = Vec::new();
        for tag_arr in tags_json {
            let tag_values: Vec<String> = tag_arr
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            if !tag_values.is_empty() {
                tags.push(Tag::parse(&tag_values).map_err(|e| SpryteCvmError::SignerError {
                    reason: format!("Invalid tag: {e}"),
                })?);
            }
        }

        let builder = EventBuilder::new(Kind::from(kind_num as u16), &content)
            .custom_created_at(Timestamp::from(created_at));

        let builder = tags.into_iter().fold(builder, |b, t| b.tag(t));

        let event = builder
            .sign_with_keys(&self.keys)
            .map_err(|e| SpryteCvmError::SignerError {
                reason: format!("Failed to sign event: {e}"),
            })?;

        let event_json =
            serde_json::to_string(&event).map_err(|e| SpryteCvmError::SignerError {
                reason: format!("Failed to serialize signed event: {e}"),
            })?;

        Ok(event_json)
    }

    async fn nip44_encrypt(
        &self,
        pubkey: String,
        plaintext: String,
    ) -> Result<String, SpryteCvmError> {
        let pk =
            PublicKey::parse(&pubkey).map_err(|e| SpryteCvmError::EncryptionError {
                reason: format!("Invalid public key: {e}"),
            })?;

        let encrypted = nip44::encrypt(
            self.keys.secret_key(),
            &pk,
            plaintext.as_bytes(),
            nip44::Version::V2,
        )
        .map_err(|e| SpryteCvmError::EncryptionError {
            reason: format!("NIP-44 encryption failed: {e}"),
        })?;

        Ok(encrypted)
    }

    async fn nip44_decrypt(
        &self,
        pubkey: String,
        ciphertext: String,
    ) -> Result<String, SpryteCvmError> {
        let pk =
            PublicKey::parse(&pubkey).map_err(|e| SpryteCvmError::EncryptionError {
                reason: format!("Invalid public key: {e}"),
            })?;

        let decrypted = nip44::decrypt(self.keys.secret_key(), &pk, &ciphertext)
            .map_err(|e| SpryteCvmError::EncryptionError {
                reason: format!("NIP-44 decryption failed: {e}"),
            })?;

        Ok(decrypted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_generate_keypair() {
        let signer = PrivateKeySigner::generate();
        let pk = signer.get_public_key().await.unwrap();
        assert_eq!(pk.len(), 64); // 32 bytes hex-encoded
    }

    #[tokio::test]
    async fn test_new_from_secret_key() {
        let keys = Keys::generate();
        let sk_hex = keys.secret_key().to_secret_hex();
        let signer = PrivateKeySigner::new(sk_hex).unwrap();
        let pk = signer.get_public_key().await.unwrap();
        assert_eq!(pk, keys.public_key().to_hex());
    }

    #[tokio::test]
    async fn test_invalid_secret_key() {
        let result = PrivateKeySigner::new("not-a-valid-key".to_string());
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_sign_event() {
        let signer = PrivateKeySigner::generate();
        let pk = signer.get_public_key().await.unwrap();

        let template = serde_json::json!({
            "kind": 1,
            "created_at": 1700000000u64,
            "tags": [],
            "content": "hello world"
        });

        let signed_json = signer.sign_event(template.to_string()).await.unwrap();
        let signed: serde_json::Value = serde_json::from_str(&signed_json).unwrap();

        assert_eq!(signed["kind"], 1);
        assert_eq!(signed["content"], "hello world");
        assert_eq!(signed["pubkey"], pk);
        assert!(signed.get("id").is_some());
        assert!(signed.get("sig").is_some());
    }

    #[tokio::test]
    async fn test_nip44_round_trip() {
        let sender = PrivateKeySigner::generate();
        let receiver = PrivateKeySigner::generate();

        let sender_pk = sender.get_public_key().await.unwrap();
        let receiver_pk = receiver.get_public_key().await.unwrap();

        let plaintext = "secret message for NIP-44 test";

        let encrypted = sender
            .nip44_encrypt(receiver_pk.clone(), plaintext.to_string())
            .await
            .unwrap();

        assert_ne!(encrypted, plaintext);

        let decrypted = receiver
            .nip44_decrypt(sender_pk, encrypted)
            .await
            .unwrap();

        assert_eq!(decrypted, plaintext);
    }
}
