// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "SpryteSDK",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
    ],
    products: [
        .library(
            name: "SpryteSDK",
            targets: ["SpryteSDK"]
        ),
    ],
    targets: [
        .target(
            name: "SpryteSDK",
            path: "Sources/SpryteSDK"
        ),
        .testTarget(
            name: "SpryteSDKTests",
            dependencies: ["SpryteSDK"]
        ),
    ]
)
