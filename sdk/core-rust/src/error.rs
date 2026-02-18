use uniffi;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum SpryteCvmError {
    #[error("Not connected to relay: {reason}")]
    NotConnected { reason: String },

    #[error("Connection failed: {reason}")]
    ConnectionFailed { reason: String },

    #[error("Request timed out: {reason}")]
    Timeout { reason: String },

    #[error("Signer error: {reason}")]
    SignerError { reason: String },

    #[error("Encryption error: {reason}")]
    EncryptionError { reason: String },

    #[error("Invalid response: {reason}")]
    InvalidResponse { reason: String },

    #[error("CVM error: {reason}")]
    CvmError { reason: String },

    #[error("Payment required: {reason}")]
    PaymentRequired { reason: String },

    #[error("Relay error: {reason}")]
    RelayError { reason: String },
}
