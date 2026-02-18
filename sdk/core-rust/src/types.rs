use uniffi;

/// Configuration for connecting to the Spryte CVM.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ClientConfig {
    /// Hex-encoded public key of the CVM server.
    pub server_pubkey: String,
    /// List of relay WebSocket URLs to connect through.
    pub relays: Vec<String>,
    /// Default timeout in seconds for requests (default: 30).
    pub timeout_secs: Option<u64>,
}

/// Input parameters for the `generate-spryte` tool call.
#[derive(Debug, Clone, uniffi::Record)]
pub struct GenerateSpryteInput {
    /// Hex-encoded Nostr pubkey to generate sprite for.
    pub pubkey: String,
    /// Pixel dimension for each cell (default: 128).
    pub cell_size: Option<u32>,
    /// Blossom server URL for uploads (uses default if omitted).
    pub upload_server: Option<String>,
    /// If true, pay per-generation to bypass plan limits.
    pub request_invoice: Option<bool>,
}

/// Output from the `generate-spryte` tool call.
#[derive(Debug, Clone, uniffi::Record)]
pub struct GenerateSpryteOutput {
    /// URL of the generated sprite sheet PNG.
    pub sprite_url: String,
    /// URL of the mapping JSON file.
    pub mapping_url: String,
    /// Number of pubkeys included in the sprite.
    pub pubkey_count: u32,
    /// Cell size used for generation.
    pub cell_size: u32,
    /// Whether the result was served from cache.
    pub cached: Option<bool>,
    /// Reasons for any limit restrictions.
    pub limit_reasons: Option<Vec<String>>,
    /// Total number of followers for the pubkey.
    pub total_followers: Option<u32>,
}

/// Output from the `get-plans` tool call (raw JSON).
#[derive(Debug, Clone, uniffi::Record)]
pub struct PlansOutput {
    /// Raw JSON string of the plans response.
    pub json: String,
}

/// Input parameters for the `subscribe` tool call.
#[derive(Debug, Clone, uniffi::Record)]
pub struct SubscribeInput {
    /// Plan ID to subscribe to (e.g. "pro", "unlimited").
    pub plan_id: String,
    /// Billing period ("monthly" or "yearly").
    pub period: String,
}

/// Output from the `subscribe` tool call.
#[derive(Debug, Clone, uniffi::Record)]
pub struct SubscribeOutput {
    /// Whether the subscription was successful.
    pub subscribed: bool,
    /// Plan ID that was subscribed to.
    pub plan_id: String,
    /// Billing period.
    pub period: String,
    /// Unix timestamp when the subscription expires.
    pub expires_at: u64,
    /// ISO 8601 string of the expiration date.
    pub expires_at_iso: String,
}

/// Progress information delivered during long-running operations.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProgressInfo {
    /// Current progress count.
    pub progress: u32,
    /// Total expected count.
    pub total: u32,
    /// Human-readable progress message.
    pub message: String,
}
