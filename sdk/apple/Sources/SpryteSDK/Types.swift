import Foundation

public struct CellDimensions: Codable, Sendable, Equatable {
    public let width: Int
    public let height: Int

    public init(width: Int, height: Int) {
        self.width = width
        self.height = height
    }
}

public struct SpriteEntry: Codable, Sendable, Equatable {
    public let x: Int
    public let y: Int
    public let source: String

    public init(x: Int, y: Int, source: String) {
        self.x = x
        self.y = y
        self.source = source
    }
}

public struct SpriteMapping: Codable, Sendable, Equatable {
    public let cellDimensions: CellDimensions
    public let mapping: [String: SpriteEntry]

    public init(cellDimensions: CellDimensions, mapping: [String: SpriteEntry]) {
        self.cellDimensions = cellDimensions
        self.mapping = mapping
    }
}

public struct SpriteSheet: Sendable, Equatable {
    public let spriteURL: URL
    public let mappingURL: URL
    public let mapping: SpriteMapping
    public let imageWidth: Int
    public let imageHeight: Int

    public init(spriteURL: URL, mappingURL: URL, mapping: SpriteMapping, imageWidth: Int, imageHeight: Int) {
        self.spriteURL = spriteURL
        self.mappingURL = mappingURL
        self.mapping = mapping
        self.imageWidth = imageWidth
        self.imageHeight = imageHeight
    }
}

public struct AvatarRenderInfo: Sendable, Equatable {
    public let spriteURL: URL
    public let displaySize: CGFloat
    public let offsetX: CGFloat
    public let offsetY: CGFloat
    public let scaledWidth: CGFloat
    public let scaledHeight: CGFloat

    public init(spriteURL: URL, displaySize: CGFloat, offsetX: CGFloat, offsetY: CGFloat, scaledWidth: CGFloat, scaledHeight: CGFloat) {
        self.spriteURL = spriteURL
        self.displaySize = displaySize
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.scaledWidth = scaledWidth
        self.scaledHeight = scaledHeight
    }
}
