use serde_json::{json, Value};

use crate::types::ProgressInfo;

// Nostr event kind constants for CVM protocol
pub const KIND_CLIENT_REQUEST: u16 = 25910;
pub const KIND_MCP_RESPONSE: u16 = 11316;
pub const KIND_PROGRESS: u16 = 11317;
pub const KIND_PAYMENT_REQUIRED: u16 = 11318;
pub const KIND_PAYMENT_CONFIRMATION: u16 = 11319;
pub const KIND_PAYMENT_ACKNOWLEDGED: u16 = 11320;

/// Build a JSON-RPC 2.0 request for an MCP `tools/call`.
pub fn build_mcp_request(id: &str, tool_name: &str, args: Value) -> String {
    let request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": args
        }
    });
    request.to_string()
}

/// Parse an MCP JSON-RPC response, extracting the result or error.
pub fn parse_mcp_response(json_str: &str) -> Result<Value, String> {
    let v: Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse MCP response JSON: {e}"))?;

    if let Some(error) = v.get("error") {
        let message = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown CVM error");
        return Err(message.to_string());
    }

    if let Some(result) = v.get("result") {
        return Ok(result.clone());
    }

    Err("MCP response missing both 'result' and 'error' fields".to_string())
}

/// Extract tool call result content from an MCP response.
/// Handles both `structuredContent` and `content[].text` formats.
pub fn extract_tool_result(result: &Value) -> Result<Value, String> {
    // Check for structuredContent first
    if let Some(structured) = result.get("structuredContent") {
        return Ok(structured.clone());
    }

    // Fall back to content array with text items
    if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
        for item in content {
            if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                    let parsed: Value = serde_json::from_str(text)
                        .map_err(|e| format!("Failed to parse tool result text: {e}"))?;
                    return Ok(parsed);
                }
            }
        }
    }

    Err("Unexpected response format from CVM".to_string())
}

/// Parse a progress notification from decrypted event content.
pub fn parse_progress(json_str: &str) -> Option<ProgressInfo> {
    let v: Value = serde_json::from_str(json_str).ok()?;

    // Progress notifications use JSON-RPC notification format
    let params = v.get("params")?;

    Some(ProgressInfo {
        progress: params
            .get("progress")
            .and_then(|p| p.as_u64())
            .unwrap_or(0) as u32,
        total: params
            .get("total")
            .and_then(|t| t.as_u64())
            .unwrap_or(100) as u32,
        message: params
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_mcp_request() {
        let req = build_mcp_request(
            "test-id-123",
            "generate-spryte",
            json!({"pubkey": "abc123", "cellSize": 128}),
        );
        let parsed: Value = serde_json::from_str(&req).unwrap();

        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["id"], "test-id-123");
        assert_eq!(parsed["method"], "tools/call");
        assert_eq!(parsed["params"]["name"], "generate-spryte");
        assert_eq!(parsed["params"]["arguments"]["pubkey"], "abc123");
        assert_eq!(parsed["params"]["arguments"]["cellSize"], 128);
    }

    #[test]
    fn test_parse_mcp_response_success() {
        let response = json!({
            "jsonrpc": "2.0",
            "id": "test-id",
            "result": {
                "content": [{"type": "text", "text": "{\"spriteUrl\": \"https://example.com/sprite.png\"}"}]
            }
        });

        let result = parse_mcp_response(&response.to_string()).unwrap();
        assert!(result.get("content").is_some());
    }

    #[test]
    fn test_parse_mcp_response_error() {
        let response = json!({
            "jsonrpc": "2.0",
            "id": "test-id",
            "error": {
                "code": -32000,
                "message": "Something went wrong"
            }
        });

        let err = parse_mcp_response(&response.to_string()).unwrap_err();
        assert_eq!(err, "Something went wrong");
    }

    #[test]
    fn test_extract_tool_result_structured() {
        let result = json!({
            "structuredContent": {
                "spriteUrl": "https://example.com/sprite.png",
                "mappingUrl": "https://example.com/mapping.json"
            }
        });

        let extracted = extract_tool_result(&result).unwrap();
        assert_eq!(extracted["spriteUrl"], "https://example.com/sprite.png");
    }

    #[test]
    fn test_extract_tool_result_text_content() {
        let inner = json!({"spriteUrl": "https://example.com/sprite.png"});
        let result = json!({
            "content": [
                {"type": "text", "text": inner.to_string()}
            ]
        });

        let extracted = extract_tool_result(&result).unwrap();
        assert_eq!(extracted["spriteUrl"], "https://example.com/sprite.png");
    }

    #[test]
    fn test_parse_progress() {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": "notifications/progress",
            "params": {
                "progress": 5,
                "total": 20,
                "message": "Processing images..."
            }
        });

        let info = parse_progress(&notification.to_string()).unwrap();
        assert_eq!(info.progress, 5);
        assert_eq!(info.total, 20);
        assert_eq!(info.message, "Processing images...");
    }

    #[test]
    fn test_parse_progress_missing_fields() {
        let notification = json!({
            "jsonrpc": "2.0",
            "method": "notifications/progress",
            "params": {
                "message": "Starting..."
            }
        });

        let info = parse_progress(&notification.to_string()).unwrap();
        assert_eq!(info.progress, 0);
        assert_eq!(info.total, 100);
        assert_eq!(info.message, "Starting...");
    }

    #[test]
    fn test_parse_progress_invalid_json() {
        assert!(parse_progress("not json").is_none());
    }

    #[test]
    fn test_parse_progress_no_params() {
        let notification = json!({"jsonrpc": "2.0", "method": "something"});
        assert!(parse_progress(&notification.to_string()).is_none());
    }
}
