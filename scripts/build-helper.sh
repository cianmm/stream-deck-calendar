#!/usr/bin/env bash
set -euo pipefail
HELPER_DIR="$(cd "$(dirname "$0")/../helper" && pwd)"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/com.cianmm.calendar.sdPlugin/bin"

# Prefer a Homebrew Swift toolchain if present: on some machines the
# Xcode Command Line Tools' bundled SwiftPM cannot link its own manifest
# (a broken/mismatched libPackageDescription.dylib), which makes every
# `swift build` invocation fail before our code is even touched.
SWIFT_BIN="swift"
if [ -x "/opt/homebrew/opt/swift/bin/swift" ]; then
    SWIFT_BIN="/opt/homebrew/opt/swift/bin/swift"
fi

cd "$HELPER_DIR"
rm -rf .build

# NOTE on architecture: a single `swift build --arch arm64 --arch x86_64`
# invocation builds a fat binary via Xcode's xcbuild/SWBBuildService build
# engine. On a machine with only the Command Line Tools installed (no full
# Xcode), that engine is unavailable/crashes, and there is also no x86_64
# Swift runtime on disk to link against on Apple Silicon without Xcode.
# So: build each requested architecture independently with SwiftPM's
# native build system (which never touches xcbuild), then merge whatever
# slices succeeded with `lipo`. On a CLT-only Apple Silicon host this
# yields an arm64-only binary; on a host with full Xcode (or an Intel
# Mac with the x86_64 runtime available) it produces a true universal
# binary. Do not "fix" this back into a single combined --arch invocation;
# that is exactly the path that crashes on Command-Line-Tools-only setups.
ARCHES=(arm64 x86_64)
BIN_PATHS=()

for ARCH in "${ARCHES[@]}"; do
    echo "Building calendar-helper for $ARCH..."
    if "$SWIFT_BIN" build -c release --build-system native --arch "$ARCH"; then
        BIN_PATHS+=("$("$SWIFT_BIN" build -c release --build-system native --arch "$ARCH" --show-bin-path)/calendar-helper")
    else
        echo "warning: build for $ARCH failed (likely no $ARCH Swift runtime/SDK available on this host without full Xcode); skipping that slice." >&2
    fi
done

if [ "${#BIN_PATHS[@]}" -eq 0 ]; then
    echo "error: no architecture built successfully." >&2
    exit 1
fi

mkdir -p "$DEST_DIR"

if [ "${#BIN_PATHS[@]}" -gt 1 ]; then
    lipo -create "${BIN_PATHS[@]}" -output "$DEST_DIR/calendar-helper"
    echo "Created universal binary from: ${BIN_PATHS[*]}"
else
    cp "${BIN_PATHS[0]}" "$DEST_DIR/calendar-helper"
    echo "warning: only built a single-architecture binary (${BIN_PATHS[0]}); universal build needs full Xcode on this host." >&2
fi

chmod +x "$DEST_DIR/calendar-helper"
echo "Copied helper to $DEST_DIR/calendar-helper"
