use serde_json::json;
use spryte_cvm_core::protocol::*;
use spryte_cvm_core::signer::NostrSigner;
use spryte_cvm_core::signer::PrivateKeySigner;
use spryte_cvm_core::types::*;

#[test]
fn test_mcp_request_framing() {
    let req = build_mcp_request(
        "req-001",
        "generate-spryte",
        json!({"pubkey": "deadbeef", "cellSize": 64}),
    );
    let parsed: serde_json::Value = serde_json::from_str(&req).unwrap();

    assert_eq!(parsed["jsonrpc"], "2.0");
    assert_eq!(parsed["id"], "req-001");
    assert_eq!(parsed["method"], "tools/call");
    assert_eq!(parsed["params"]["name"], "generate-spryte");
    assert_eq!(parsed["params"]["arguments"]["pubkey"], "deadbeef");
    assert_eq!(parsed["params"]["arguments"]["cellSize"], 64);
}

#[test]
fn test_mcp_request_get_plans() {
    let req = build_mcp_request("req-002", "get-plans", json!({}));
    let parsed: serde_json::Value = serde_json::from_str(&req).unwrap();

    assert_eq!(parsed["params"]["name"], "get-plans");
    assert_eq!(parsed["params"]["arguments"], json!({}));
}

#[test]
fn test_mcp_request_subscribe() {
    let req = build_mcp_request(
        "req-003",
        "subscribe",
        json!({"planId": "pro", "period": "monthly"}),
    );
    let parsed: serde_json::Value = serde_json::from_str(&req).unwrap();

    assert_eq!(parsed["params"]["name"], "subscribe");
    assert_eq!(parsed["params"]["arguments"]["planId"], "pro");
    assert_eq!(parsed["params"]["arguments"]["period"], "monthly");
}

#[test]
fn test_parse_success_response() {
    let response = json!({
        "jsonrpc": "2.0",
        "id": "req-001",
        "result": {
            "content": [{
                "type": "text",
                "text": "{\"spriteUrl\":\"https://example.com/sprite.png\"}"
            }]
        }
    });

    let result = parse_mcp_response(&response.to_string()).unwrap();
    let tool_result = extract_tool_result(&result).unwrap();
    assert_eq!(tool_result["spriteUrl"], "https://example.com/sprite.png");
}

#[test]
fn test_parse_error_response() {
    let response = json!({
        "jsonrpc": "2.0",
        "id": "req-001",
        "error": {
            "code": -32000,
            "message": "Rate limited"
        }
    });

    let err = parse_mcp_response(&response.to_string()).unwrap_err();
    assert!(err.contains("Rate limited"));
}

#[test]
fn test_parse_structured_content() {
    let result = json!({
        "structuredContent": {
            "spriteUrl": "https://example.com/sprite.png",
            "mappingUrl": "https://example.com/mapping.json",
            "pubkeyCount": 150,
            "cellSize": 128
        }
    });

    let tool_result = extract_tool_result(&result).unwrap();
    assert_eq!(tool_result["pubkeyCount"], 150);
    assert_eq!(tool_result["cellSize"], 128);
}

#[test]
fn test_progress_parsing() {
    let notification = json!({
        "jsonrpc": "2.0",
        "method": "notifications/progress",
        "params": {
            "progress": 10,
            "total": 50,
            "message": "Fetching profile images..."
        }
    });

    let info = parse_progress(&notification.to_string()).unwrap();
    assert_eq!(info.progress, 10);
    assert_eq!(info.total, 50);
    assert_eq!(info.message, "Fetching profile images...");
}

#[test]
fn test_progress_defaults() {
    let notification = json!({
        "jsonrpc": "2.0",
        "method": "notifications/progress",
        "params": {}
    });

    let info = parse_progress(&notification.to_string()).unwrap();
    assert_eq!(info.progress, 0);
    assert_eq!(info.total, 100);
    assert_eq!(info.message, "");
}

#[tokio::test]
async fn test_signer_generate_and_sign() {
    let signer = PrivateKeySigner::generate();
    let pk = signer.get_public_key().await.unwrap();
    assert_eq!(pk.len(), 64);

    let template = json!({
        "kind": 25910,
        "created_at": 1700000000u64,
        "tags": [["p", "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"]],
        "content": "encrypted-content"
    });

    let signed = signer.sign_event(template.to_string()).await.unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&signed).unwrap();

    assert_eq!(parsed["kind"], 25910);
    assert_eq!(parsed["pubkey"], pk);
    assert!(parsed["id"].as_str().unwrap().len() == 64);
    assert!(parsed["sig"].as_str().unwrap().len() == 128);
}

#[tokio::test]
async fn test_nip44_encrypt_decrypt_round_trip() {
    let alice = PrivateKeySigner::generate();
    let bob = PrivateKeySigner::generate();

    let alice_pk = alice.get_public_key().await.unwrap();
    let bob_pk = bob.get_public_key().await.unwrap();

    let message = r#"{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"generate-spryte","arguments":{"pubkey":"test"}}}"#;

    let encrypted = alice
        .nip44_encrypt(bob_pk.clone(), message.to_string())
        .await
        .unwrap();

    assert_ne!(encrypted, message);
    assert!(!encrypted.is_empty());

    let decrypted = bob
        .nip44_decrypt(alice_pk.clone(), encrypted)
        .await
        .unwrap();

    assert_eq!(decrypted, message);
}

#[tokio::test]
async fn test_signer_invalid_key() {
    let result = PrivateKeySigner::new("invalid".to_string());
    assert!(result.is_err());
}

#[test]
fn test_client_config_defaults() {
    let config = ClientConfig {
        server_pubkey: "abc123".to_string(),
        relays: vec!["wss://relay.example.com".to_string()],
        timeout_secs: None,
    };

    assert_eq!(config.server_pubkey, "abc123");
    assert_eq!(config.relays.len(), 1);
    assert!(config.timeout_secs.is_none());
}

#[test]
fn test_generate_spryte_input() {
    let input = GenerateSpryteInput {
        pubkey: "deadbeef".to_string(),
        cell_size: Some(64),
        upload_server: None,
        request_invoice: Some(true),
    };

    assert_eq!(input.pubkey, "deadbeef");
    assert_eq!(input.cell_size, Some(64));
    assert!(input.upload_server.is_none());
    assert_eq!(input.request_invoice, Some(true));
}

#[test]
fn test_event_kind_constants() {
    assert_eq!(KIND_CLIENT_REQUEST, 25910);
    assert_eq!(KIND_MCP_RESPONSE, 11316);
    assert_eq!(KIND_PROGRESS, 11317);
    assert_eq!(KIND_PAYMENT_REQUIRED, 11318);
    assert_eq!(KIND_PAYMENT_CONFIRMATION, 11319);
    assert_eq!(KIND_PAYMENT_ACKNOWLEDGED, 11320);
}
