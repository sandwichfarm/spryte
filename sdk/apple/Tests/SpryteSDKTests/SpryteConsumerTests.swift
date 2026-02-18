import XCTest
@testable import SpryteSDK

/// Unit tests for SpryteConsumer render math.
/// Values verified against TypeScript reference implementation in client/src/sprites.ts.
final class SpryteConsumerTests: XCTestCase {

    let consumer = SpryteConsumer()

    // Test mapping matching the plan's reference test values
    let referenceMapping = SpriteMapping(
        cellDimensions: CellDimensions(width: 128, height: 128),
        mapping: [
            "pubkey_a": SpriteEntry(x: 256, y: 128, source: "test.png"),
            "pubkey_b": SpriteEntry(x: 0, y: 0, source: "test.png"),
            // Max entry to produce imageWidth=1664, imageHeight=1664
            "pubkey_max": SpriteEntry(x: 1536, y: 1536, source: "test.png"),
        ]
    )

    lazy var referenceSheet = SpriteSheet(
        spriteURL: URL(string: "https://example.com/sprite.png")!,
        mappingURL: URL(string: "https://example.com/mapping.json")!,
        mapping: referenceMapping,
        imageWidth: 1664,
        imageHeight: 1664
    )

    func testComputeImageDimensions() {
        let (width, height) = SpryteConsumer.computeImageDimensions(mapping: referenceMapping)
        XCTAssertEqual(width, 1664)
        XCTAssertEqual(height, 1664)
    }

    func testComputeImageDimensionsEmpty() {
        let empty = SpriteMapping(
            cellDimensions: CellDimensions(width: 128, height: 128),
            mapping: [:]
        )
        let (width, height) = SpryteConsumer.computeImageDimensions(mapping: empty)
        XCTAssertEqual(width, 0)
        XCTAssertEqual(height, 0)
    }

    func testRenderInfoMatchesTypeScriptReference() {
        // From plan: cellDimensions.width=128, displaySize=48, entry at x=256, y=128
        // Expected: scale=0.375, offsetX=-96.0, offsetY=-48.0, scaledWidth=624.0, scaledHeight=624.0
        let info = consumer.renderInfo(sheet: referenceSheet, pubkey: "pubkey_a", displaySize: 48)
        XCTAssertNotNil(info)
        guard let info = info else { return }

        XCTAssertEqual(info.displaySize, 48)
        XCTAssertEqual(info.offsetX, -96.0, accuracy: 0.001)
        XCTAssertEqual(info.offsetY, -48.0, accuracy: 0.001)
        XCTAssertEqual(info.scaledWidth, 624.0, accuracy: 0.001)
        XCTAssertEqual(info.scaledHeight, 624.0, accuracy: 0.001)
    }

    func testRenderInfoAtOrigin() {
        let info = consumer.renderInfo(sheet: referenceSheet, pubkey: "pubkey_b", displaySize: 48)
        XCTAssertNotNil(info)
        guard let info = info else { return }

        XCTAssertEqual(info.offsetX, 0.0, accuracy: 0.001)
        XCTAssertEqual(info.offsetY, 0.0, accuracy: 0.001)
        XCTAssertEqual(info.scaledWidth, 624.0, accuracy: 0.001)
        XCTAssertEqual(info.scaledHeight, 624.0, accuracy: 0.001)
    }

    func testRenderInfoReturnsNilForUnknownPubkey() {
        let info = consumer.renderInfo(sheet: referenceSheet, pubkey: "nonexistent")
        XCTAssertNil(info)
    }

    func testRenderInfoWithRealGeneratedData() {
        // Values from sdk/verify.ts output with the generated sprite sheet
        let realMapping = SpriteMapping(
            cellDimensions: CellDimensions(width: 128, height: 128),
            mapping: [
                "bb0174ae21a6cac1a0a9c8b4ac6ebfda56ce51605c315b1824970bc275f7239a":
                    SpriteEntry(x: 128, y: 0, source: "test.jpg"),
                "a9434ee165ed01b286becfc2771ef1705d3537d051b387288898cc00d5c885be":
                    SpriteEntry(x: 256, y: 0, source: "test.jpg"),
            ]
        )
        let realSheet = SpriteSheet(
            spriteURL: URL(string: "https://example.com/sprite.png")!,
            mappingURL: URL(string: "https://example.com/mapping.json")!,
            mapping: realMapping,
            imageWidth: 384,  // max x=256 + 128
            imageHeight: 128  // max y=0 + 128
        )

        let info = consumer.renderInfo(
            sheet: realSheet,
            pubkey: "bb0174ae21a6cac1a0a9c8b4ac6ebfda56ce51605c315b1824970bc275f7239a",
            displaySize: 48
        )
        XCTAssertNotNil(info)
        guard let info = info else { return }
        XCTAssertEqual(info.offsetX, -48.0, accuracy: 0.001)
        XCTAssertEqual(info.offsetY, 0.0, accuracy: 0.001)
        XCTAssertEqual(info.scaledWidth, 144.0, accuracy: 0.001)  // 384 * 0.375
        XCTAssertEqual(info.scaledHeight, 48.0, accuracy: 0.001)  // 128 * 0.375
    }

    func testPubkeys() {
        let keys = consumer.pubkeys(in: referenceMapping)
        XCTAssertEqual(keys.count, 3)
        XCTAssertTrue(keys.contains("pubkey_a"))
        XCTAssertTrue(keys.contains("pubkey_b"))
        XCTAssertTrue(keys.contains("pubkey_max"))
    }

    func testHasPubkey() {
        XCTAssertTrue(consumer.hasPubkey(in: referenceMapping, pubkey: "pubkey_a"))
        XCTAssertFalse(consumer.hasPubkey(in: referenceMapping, pubkey: "nonexistent"))
    }

    func testDefaultDisplaySize() {
        let info = consumer.renderInfo(sheet: referenceSheet, pubkey: "pubkey_a")
        XCTAssertNotNil(info)
        XCTAssertEqual(info?.displaySize, 48)
    }

    func testRenderInfoWithDifferentDisplaySize() {
        let info = consumer.renderInfo(sheet: referenceSheet, pubkey: "pubkey_a", displaySize: 64)
        XCTAssertNotNil(info)
        guard let info = info else { return }
        // scale = 64 / 128 = 0.5
        XCTAssertEqual(info.offsetX, -128.0, accuracy: 0.001)   // -(256 * 0.5)
        XCTAssertEqual(info.offsetY, -64.0, accuracy: 0.001)    // -(128 * 0.5)
        XCTAssertEqual(info.scaledWidth, 832.0, accuracy: 0.001)  // 1664 * 0.5
        XCTAssertEqual(info.scaledHeight, 832.0, accuracy: 0.001) // 1664 * 0.5
    }
}
