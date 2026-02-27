# Changelog

All notable changes to the Graphics.h Compiler extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.6] - 2025

### Fixed
- Linux compilation and run commands now use `spawn(command, args[])` directly instead of `bash -c "string"`, eliminating a shell injection vulnerability where filenames containing quotes or special characters could break the command
- `stopRunningProgram()` now sends a `Ctrl+C` signal to the terminal before disposing it, giving the running process a chance to exit cleanly instead of being force-killed
- `isProgramRunning()` now correctly returns `true` when a program is running inside the integrated terminal, not just when managed as a background process — fixes the status bar staying on "Run" instead of switching to "Stop"
- Status bar and keybindings now correctly activate for `.c++` files in addition to `.cpp` files
- `setInterval` for status bar polling is now properly cleared on extension deactivation, fixing a resource leak
- Cancellation tokens are now properly wired up — pressing Cancel on the compilation progress notification actually stops the compiler process
- Path validation now uses `path.resolve()` instead of checking for `..` substrings, which was unreliable on Windows paths

### Added
- `runInTerminal` setting is now exposed in the VS Code Settings UI under Graphics.h Compiler — previously it was read by the compiler but not declared in `package.json`, making it invisible to users
- Extraction progress now shows live file count during the MinGW toolchain setup (e.g. "Extracting files... 42% (840 / 2000)") instead of appearing frozen after the download finished
- Extension now activates for `.c++` files via the `onLanguage:c++` activation event

### Changed
- `compileWindows` and `compileLinux` merged into a single `runCompilation()` method — the two were nearly identical with only the command and args differing
- `runWindows` and `runLinux` merged into a single `runExecutable()` method for the same reason
- Dead code removed from `ubuntuDownloader.ts` — the `compile()` and `run()` methods in that file were never called (compiler.ts handles all execution) and have been deleted
- All emoji characters removed from notification messages
- Progress message during toolchain extraction changed from a single static "Extracting MinGW32 toolchain..." to a live percentage counter so users can see the process is not frozen
- Toolchain setup permission dialog updated to reflect accurate disk space (~950 MB extracted, not ~770 MB)

---

## [1.0.5] - 2025

### Added
- Ubuntu/Linux support via Wine and MinGW cross-compiler
- Guided installation flow for Linux with clipboard copy and terminal open
- `UbuntuDownloader` class to coordinate Linux setup

### Changed
- Extension now detects OS on activation and initialises the appropriate downloader

---

## [1.0.4] - 2025

### Added
- SHA256 checksum verification for the MinGW32 toolchain download
- Streaming download with per-chunk progress reporting

### Fixed
- Partial ZIP files are now cleaned up if the download or extraction fails

---

## [1.0.3] - 2025

### Added
- Cancellation token support in the compiler — users can cancel a build in progress

### Fixed
- Active compiler processes are now tracked in a Set and killed on extension deactivation

---

## [1.0.2] - 2025

### Added
- Compilation errors parsed from stderr and surfaced as VS Code diagnostics (Problems panel, inline squiggles)
- "Show Problems" option in the compilation failure notification

---

## [1.0.1] - 2025

### Fixed
- Extension now checks for unsupported operating systems on activation and shows a clear error instead of silently failing

---

## [1.0.0] - 2025

### Added
- Initial release
- One-click compile and run for graphics.h programs on Windows
- Automatic MinGW32 toolchain download and installation
- Status bar button showing run/stop state
- Output panel with compiler messages
- `Ctrl+Alt+N` keybinding to compile and run
- `Ctrl+Alt+B` keybinding to compile only
- `Ctrl+Alt+K` keybinding to stop the running program