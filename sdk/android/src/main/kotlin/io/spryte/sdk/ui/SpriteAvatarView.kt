package io.spryte.sdk.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import io.spryte.sdk.SpryteConsumer
import io.spryte.sdk.SpriteSheet

/**
 * Jetpack Compose component that renders a single avatar from a sprite sheet.
 *
 * Loads the full sprite PNG via Coil (benefiting from its disk/memory cache so the
 * sheet image is shared across all avatar instances), then offsets and clips to show
 * only the cell for the given pubkey.
 *
 * @param sheet A loaded SpriteSheet
 * @param pubkey The hex pubkey to render
 * @param displaySize Avatar size in dp (default: 48)
 * @param modifier Optional Compose modifier
 * @param circular Whether to clip the avatar as a circle (default: true)
 */
@Composable
fun SpriteAvatarView(
    sheet: SpriteSheet,
    pubkey: String,
    displaySize: Int = 48,
    modifier: Modifier = Modifier,
    circular: Boolean = true,
) {
    val consumer = SpryteConsumer()
    val renderInfo = consumer.getRenderInfo(sheet, pubkey, displaySize) ?: return

    val density = LocalDensity.current
    val sizeDp = displaySize.dp
    val offsetXDp = with(density) { renderInfo.offsetX.toDp() }
    val offsetYDp = with(density) { renderInfo.offsetY.toDp() }
    val scaledWidthDp = with(density) { renderInfo.scaledWidth.toDp() }
    val scaledHeightDp = with(density) { renderInfo.scaledHeight.toDp() }

    val clipModifier = if (circular) Modifier.clip(CircleShape) else Modifier

    Box(
        modifier = modifier
            .size(sizeDp)
            .then(clipModifier)
    ) {
        AsyncImage(
            model = sheet.spriteUrl,
            contentDescription = "Avatar for $pubkey",
            contentScale = ContentScale.FillBounds,
            modifier = Modifier
                .size(scaledWidthDp, scaledHeightDp)
                .offset(offsetXDp, offsetYDp)
        )
    }
}
