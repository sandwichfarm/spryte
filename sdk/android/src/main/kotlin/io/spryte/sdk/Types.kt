package io.spryte.sdk

import kotlinx.serialization.Serializable

@Serializable
data class CellDimensions(
    val width: Int,
    val height: Int,
)

@Serializable
data class SpriteEntry(
    val x: Int,
    val y: Int,
    val source: String,
)

@Serializable
data class SpriteMapping(
    val cellDimensions: CellDimensions,
    val mapping: Map<String, SpriteEntry>,
)

data class SpriteSheet(
    val spriteUrl: String,
    val mappingUrl: String,
    val mapping: SpriteMapping,
    val imageWidth: Int,
    val imageHeight: Int,
)

data class AvatarRenderInfo(
    val spriteUrl: String,
    val displaySize: Int,
    val offsetX: Float,
    val offsetY: Float,
    val scaledWidth: Float,
    val scaledHeight: Float,
)
