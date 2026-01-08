// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "Onstage",
  platforms: [
    .iOS(.v16)
  ],
  products: [
    .library(
      name: "Onstage",
      targets: ["Onstage"])
  ],
  dependencies: [
    // Networking
    .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.9.0"),
    // Image Loading
    .package(url: "https://github.com/kean/Nuke.git", from: "12.0.0"),
    // Keychain
    .package(url: "https://github.com/kishikawakatsumi/KeychainAccess.git", from: "4.2.0"),
    // Markdown Rendering
  ],
  targets: [
    .target(
      name: "Onstage",
      dependencies: [
        "Alamofire",
        "Nuke",
        "KeychainAccess",
      ],
      path: "Sources"),
    .testTarget(
      name: "OnstageTests",
      dependencies: ["Onstage"]),
  ]
)
