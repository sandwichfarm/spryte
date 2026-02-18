#if canImport(SwiftUI)
import SwiftUI

/// SwiftUI view that renders a single avatar from a sprite sheet.
///
/// Loads the full sprite PNG via AsyncImage (benefiting from URLSession caching),
/// then offsets and clips to show only the cell for the given pubkey.
@available(iOS 15.0, macOS 12.0, *)
public struct SpriteAvatarView: View {
    let sheet: SpriteSheet
    let pubkey: String
    let size: CGFloat
    let circular: Bool

    private let consumer = SpryteConsumer()

    public init(sheet: SpriteSheet, pubkey: String, size: CGFloat = 48, circular: Bool = true) {
        self.sheet = sheet
        self.pubkey = pubkey
        self.size = size
        self.circular = circular
    }

    public var body: some View {
        if let info = consumer.renderInfo(sheet: sheet, pubkey: pubkey, displaySize: size) {
            AsyncImage(url: info.spriteURL) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .frame(width: info.scaledWidth, height: info.scaledHeight)
                        .offset(x: info.offsetX, y: info.offsetY)
                case .failure:
                    Color.gray
                        .frame(width: size, height: size)
                default:
                    Color.clear
                        .frame(width: size, height: size)
                }
            }
            .frame(width: size, height: size)
            .clipped()
            .clipShape(circular ? AnyShape(Circle()) : AnyShape(Rectangle()))
        }
    }
}

/// Type-erased Shape wrapper for conditional clipping.
@available(iOS 15.0, macOS 12.0, *)
private struct AnyShape: Shape {
    private let pathBuilder: (CGRect) -> Path

    init<S: Shape>(_ shape: S) {
        pathBuilder = { rect in shape.path(in: rect) }
    }

    func path(in rect: CGRect) -> Path {
        pathBuilder(rect)
    }
}
#endif

#if canImport(UIKit)
import UIKit

@available(iOS 15.0, *)
extension UIImageView {
    /// Load and display a sprite avatar for the given pubkey.
    ///
    /// Downloads the sprite sheet image (or uses cached version), then crops
    /// and scales to the correct cell.
    ///
    /// - Parameters:
    ///   - sheet: A loaded SpriteSheet
    ///   - pubkey: The hex pubkey to render
    ///   - displaySize: Avatar size in points (default: 48)
    public func setSpriteAvatar(sheet: SpriteSheet, pubkey: String, displaySize: CGFloat = 48) {
        let consumer = SpryteConsumer()
        guard let info = consumer.renderInfo(sheet: sheet, pubkey: pubkey, displaySize: displaySize) else {
            self.image = nil
            return
        }

        // Find the entry to get the original cell coordinates
        guard let entry = sheet.mapping.mapping[pubkey] else { return }

        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: info.spriteURL)
                guard let fullImage = UIImage(data: data),
                      let cgImage = fullImage.cgImage else { return }

                // Crop to the cell in the original image
                let cropRect = CGRect(
                    x: entry.x,
                    y: entry.y,
                    width: sheet.mapping.cellDimensions.width,
                    height: sheet.mapping.cellDimensions.height
                )
                guard let croppedCG = cgImage.cropping(to: cropRect) else { return }
                let cropped = UIImage(cgImage: croppedCG)

                await MainActor.run {
                    self.image = cropped
                    self.contentMode = .scaleAspectFill
                    self.clipsToBounds = true
                    self.layer.cornerRadius = displaySize / 2
                }
            } catch {
                // Silently fail — the image view remains unchanged
            }
        }
    }
}
#endif
