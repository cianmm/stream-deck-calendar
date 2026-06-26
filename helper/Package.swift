// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "calendar-helper",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "calendar-helper",
            path: "Sources/calendar-helper",
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "Info.plist",
                ])
            ]
        )
    ]
)
