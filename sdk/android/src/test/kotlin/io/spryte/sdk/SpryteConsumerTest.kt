package io.spryte.sdk

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for SpryteConsumer render math.
 * Values verified against TypeScript reference implementation in client/src/sprites.ts.
 */
class SpryteConsumerTest {

    private val consumer = SpryteConsumer()

    // Test mapping matching the plan's reference test values
    private val referenceMapping = SpriteMapping(
        cellDimensions = CellDimensions(width = 128, height = 128),
        mapping = mapOf(
            "pubkey_a" to SpriteEntry(x = 256, y = 128, source = "test.png"),
            "pubkey_b" to SpriteEntry(x = 0, y = 0, source = "test.png"),
            // Max entry to produce imageWidth=1664, imageHeight=1664
            "pubkey_max" to SpriteEntry(x = 1536, y = 1536, source = "test.png"),
        )
    )

    private val referenceSheet = SpriteSheet(
        spriteUrl = "https://example.com/sprite.png",
        mappingUrl = "https://example.com/mapping.json",
        mapping = referenceMapping,
        imageWidth = 1664,
        imageHeight = 1664,
    )

    @Test
    fun `computeImageDimensions matches expected values`() {
        val (width, height) = SpryteConsumer.computeImageDimensions(referenceMapping)
        assertEquals(1664, width)
        assertEquals(1664, height)
    }

    @Test
    fun `computeImageDimensions handles empty mapping`() {
        val empty = SpriteMapping(
            cellDimensions = CellDimensions(width = 128, height = 128),
            mapping = emptyMap()
        )
        val (width, height) = SpryteConsumer.computeImageDimensions(empty)
        assertEquals(0, width)
        assertEquals(0, height)
    }

    @Test
    fun `getRenderInfo matches TypeScript reference - plan test case`() {
        // From plan: cellDimensions.width=128, displaySize=48, entry at x=256, y=128
        // Expected: scale=0.375, offsetX=-96.0, offsetY=-48.0, scaledWidth=624.0, scaledHeight=624.0
        val info = consumer.getRenderInfo(referenceSheet, "pubkey_a", displaySize = 48)
        assertNotNull(info)
        info!!

        assertEquals(48, info.displaySize)
        assertEquals(-96.0f, info.offsetX, 0.001f)
        assertEquals(-48.0f, info.offsetY, 0.001f)
        assertEquals(624.0f, info.scaledWidth, 0.001f)
        assertEquals(624.0f, info.scaledHeight, 0.001f)
    }

    @Test
    fun `getRenderInfo at origin`() {
        val info = consumer.getRenderInfo(referenceSheet, "pubkey_b", displaySize = 48)
        assertNotNull(info)
        info!!

        assertEquals(0.0f, info.offsetX, 0.001f)
        assertEquals(0.0f, info.offsetY, 0.001f)
        assertEquals(624.0f, info.scaledWidth, 0.001f)
        assertEquals(624.0f, info.scaledHeight, 0.001f)
    }

    @Test
    fun `getRenderInfo returns null for unknown pubkey`() {
        val info = consumer.getRenderInfo(referenceSheet, "nonexistent")
        assertNull(info)
    }

    @Test
    fun `getRenderInfo with real generated sprite data`() {
        // Values from sdk/verify.ts output with the generated sprite sheet
        val realMapping = SpriteMapping(
            cellDimensions = CellDimensions(width = 128, height = 128),
            mapping = mapOf(
                "bb0174ae21a6cac1a0a9c8b4ac6ebfda56ce51605c315b1824970bc275f7239a" to
                    SpriteEntry(x = 128, y = 0, source = "test.jpg"),
                "a9434ee165ed01b286becfc2771ef1705d3537d051b387288898cc00d5c885be" to
                    SpriteEntry(x = 256, y = 0, source = "test.jpg"),
            )
        )
        val realSheet = SpriteSheet(
            spriteUrl = "https://example.com/sprite.png",
            mappingUrl = "https://example.com/mapping.json",
            mapping = realMapping,
            imageWidth = 384,  // max x=256 + 128
            imageHeight = 128, // max y=0 + 128
        )

        val info = consumer.getRenderInfo(
            realSheet,
            "bb0174ae21a6cac1a0a9c8b4ac6ebfda56ce51605c315b1824970bc275f7239a",
            displaySize = 48,
        )
        assertNotNull(info)
        info!!
        assertEquals(-48.0f, info.offsetX, 0.001f)
        assertEquals(0.0f, info.offsetY, 0.001f)
        assertEquals(144.0f, info.scaledWidth, 0.001f) // 384 * 0.375
        assertEquals(48.0f, info.scaledHeight, 0.001f) // 128 * 0.375
    }

    @Test
    fun `getPubkeys returns all keys`() {
        val keys = consumer.getPubkeys(referenceMapping)
        assertEquals(3, keys.size)
        assertTrue(keys.contains("pubkey_a"))
        assertTrue(keys.contains("pubkey_b"))
        assertTrue(keys.contains("pubkey_max"))
    }

    @Test
    fun `hasPubkey returns correct results`() {
        assertTrue(consumer.hasPubkey(referenceMapping, "pubkey_a"))
        assertFalse(consumer.hasPubkey(referenceMapping, "nonexistent"))
    }

    @Test
    fun `default displaySize is 48`() {
        val info = consumer.getRenderInfo(referenceSheet, "pubkey_a")
        assertNotNull(info)
        assertEquals(48, info!!.displaySize)
    }

    @Test
    fun `getRenderInfo with different displaySize`() {
        val info = consumer.getRenderInfo(referenceSheet, "pubkey_a", displaySize = 64)
        assertNotNull(info)
        info!!
        // scale = 64 / 128 = 0.5
        assertEquals(-128.0f, info.offsetX, 0.001f)  // -(256 * 0.5)
        assertEquals(-64.0f, info.offsetY, 0.001f)   // -(128 * 0.5)
        assertEquals(832.0f, info.scaledWidth, 0.001f)  // 1664 * 0.5
        assertEquals(832.0f, info.scaledHeight, 0.001f) // 1664 * 0.5
    }
}
