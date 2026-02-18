import Foundation

public final class SpryteConsumer: Sendable {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    /// Fetch and parse a sprite mapping JSON from a URL.
    public func fetchMapping(url: URL) async throws -> SpriteMapping {
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw SpryteError.fetchFailed(url: url)
        }
        let decoder = JSONDecoder()
        return try decoder.decode(SpriteMapping.self, from: data)
    }

    /// Load a complete SpriteSheet: fetch the mapping and compute image dimensions
    /// from the mapping entries (no image decoding required).
    public func loadSpriteSheet(spriteURL: URL, mappingURL: URL) async throws -> SpriteSheet {
        let mapping = try await fetchMapping(url: mappingURL)
        let (imageWidth, imageHeight) = Self.computeImageDimensions(mapping: mapping)
        return SpriteSheet(
            spriteURL: spriteURL,
            mappingURL: mappingURL,
            mapping: mapping,
            imageWidth: imageWidth,
            imageHeight: imageHeight
        )
    }

    /// Compute render info for a single avatar from a sprite sheet.
    ///
    /// - Parameters:
    ///   - sheet: A loaded SpriteSheet
    ///   - pubkey: The hex pubkey to look up
    ///   - displaySize: Desired avatar size in points (default: 48)
    /// - Returns: AvatarRenderInfo, or nil if pubkey is not in the mapping
    public func renderInfo(sheet: SpriteSheet, pubkey: String, displaySize: CGFloat = 48) -> AvatarRenderInfo? {
        guard let entry = sheet.mapping.mapping[pubkey] else { return nil }
        let scale = displaySize / CGFloat(sheet.mapping.cellDimensions.width)

        return AvatarRenderInfo(
            spriteURL: sheet.spriteURL,
            displaySize: displaySize,
            offsetX: -(CGFloat(entry.x) * scale),
            offsetY: -(CGFloat(entry.y) * scale),
            scaledWidth: CGFloat(sheet.imageWidth) * scale,
            scaledHeight: CGFloat(sheet.imageHeight) * scale
        )
    }

    /// Get all pubkeys present in a sprite mapping.
    public func pubkeys(in mapping: SpriteMapping) -> [String] {
        Array(mapping.mapping.keys)
    }

    /// Check if a pubkey exists in a sprite mapping.
    public func hasPubkey(in mapping: SpriteMapping, pubkey: String) -> Bool {
        mapping.mapping[pubkey] != nil
    }

    /// Compute image dimensions from mapping entries without decoding the image.
    /// imageWidth  = max(entry.x) + cellDimensions.width
    /// imageHeight = max(entry.y) + cellDimensions.height
    public static func computeImageDimensions(mapping: SpriteMapping) -> (width: Int, height: Int) {
        guard !mapping.mapping.isEmpty else { return (0, 0) }
        let maxX = mapping.mapping.values.map(\.x).max() ?? 0
        let maxY = mapping.mapping.values.map(\.y).max() ?? 0
        return (
            maxX + mapping.cellDimensions.width,
            maxY + mapping.cellDimensions.height
        )
    }
}

public enum SpryteError: Error, LocalizedError {
    case fetchFailed(url: URL)

    public var errorDescription: String? {
        switch self {
        case .fetchFailed(let url):
            return "Failed to fetch resource at \(url)"
        }
    }
}
