uniffi::setup_scaffolding!();

pub mod error;
pub mod types;
pub mod protocol;
pub mod signer;
pub mod transport;
pub mod client;

pub use error::SpryteCvmError;
pub use types::*;
pub use signer::{NostrSigner, PrivateKeySigner};
pub use transport::NostrTransport;
pub use client::SpryteCvmClient;
