package io.spryte.sdk

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

class SpryteConsumer(
    private val httpClient: OkHttpClient = OkHttpClient(),
) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Fetch and parse a sprite mapping JSON from a URL.
     */
    suspend fun fetchMapping(url: String): SpriteMapping = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).build()
        val response = httpClient.newCall(request).execute()
        if (!response.isSuccessful) {
            throw RuntimeException("Failed to fetch mapping: ${response.code}")
        }
        val body = response.body?.string()
            ?: throw RuntimeException("Empty response body from mapping URL")
        json.decodeFromString<SpriteMapping>(body)
    }

    /**
     * Load a complete SpriteSheet: fetch the mapping and compute image dimensions
     * from the mapping entries (no image decoding required).
     */
    suspend fun loadSpriteSheet(spriteUrl: String, mappingUrl: String): SpriteSheet {
        val mapping = fetchMapping(mappingUrl)
        val (imageWidth, imageHeight) = computeImageDimensions(mapping)
        return SpriteSheet(
            spriteUrl = spriteUrl,
            mappingUrl = mappingUrl,
            mapping = mapping,
            imageWidth = imageWidth,
            imageHeight = imageHeight,
        )
    }

    /**
     * Compute render info for a single avatar from a sprite sheet.
     *
     * @param sheet A loaded SpriteSheet
     * @param pubkey The hex pubkey to look up
     * @param displaySize Desired avatar size in pixels (default: 48)
     * @return AvatarRenderInfo, or null if pubkey is not in the mapping
     */
    fun getRenderInfo(sheet: SpriteSheet, pubkey: String, displaySize: Int = 48): AvatarRenderInfo? {
        val entry = sheet.mapping.mapping[pubkey] ?: return null
        val scale = displaySize.toFloat() / sheet.mapping.cellDimensions.width.toFloat()

        return AvatarRenderInfo(
            spriteUrl = sheet.spriteUrl,
            displaySize = displaySize,
            offsetX = -(entry.x.toFloat() * scale),
            offsetY = -(entry.y.toFloat() * scale),
            scaledWidth = sheet.imageWidth.toFloat() * scale,
            scaledHeight = sheet.imageHeight.toFloat() * scale,
        )
    }

    /**
     * Get all pubkeys present in a sprite mapping.
     */
    fun getPubkeys(mapping: SpriteMapping): List<String> {
        return mapping.mapping.keys.toList()
    }

    /**
     * Check if a pubkey exists in a sprite mapping.
     */
    fun hasPubkey(mapping: SpriteMapping, pubkey: String): Boolean {
        return pubkey in mapping.mapping
    }

    companion object {
        /**
         * Compute image dimensions from mapping entries without decoding the image.
         * imageWidth  = max(entry.x) + cellDimensions.width
         * imageHeight = max(entry.y) + cellDimensions.height
         */
        fun computeImageDimensions(mapping: SpriteMapping): Pair<Int, Int> {
            val entries = mapping.mapping.values
            if (entries.isEmpty()) return Pair(0, 0)
            val maxX = entries.maxOf { it.x }
            val maxY = entries.maxOf { it.y }
            return Pair(
                maxX + mapping.cellDimensions.width,
                maxY + mapping.cellDimensions.height,
            )
        }
    }
}
