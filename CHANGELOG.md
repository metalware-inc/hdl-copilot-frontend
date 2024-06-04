# Change Log

All notable changes to the "hdl-copilot" extension will be documented in this file.

## v0.0.49 - 2024-05-21
- Extend support for libc >= 2.28.
## v0.0.48 - 2024-05-10
- Bug-fix: new files were not picked up by linter.
## v0.0.47 - 2024-05-04
- UI: Add 22 scope delimiter-pairs for highlighting ((begin, end), (module, endmodule) etc.)
## v0.0.46 - 2024-05-03
- Cache license in user AppData on Windows to prevent perm issues.
- Forward failure to write license to frontend.
## v0.0.45 - 2024-05-01
- Add Linux ARM64 support.
## v0.0.44 - 2024-04-25
- Cache indexed files (speed-up).
- Do not rebuild hierarchy on every file change (speed-up).
- Disregard excluded files from compilation instead of just discarding diagnotics originating in them (speed-up).
- Improve SVA gen robustness.
## v0.0.43 - 2024-04-19
- Rename codegen command to "Generate/Modify SVA".
- Licensing bug.
## v0.0.42 - 2024-04-19
- Linux fix.
## v0.0.41 - 2024-04-17
- LLM experimental feature.
## v0.0.40 - 2024-04-13
- Update README to indicate Windows support.
## v0.0.39 - 2024-04-13
- Fix exclusions/inclusions on Windows.
- Fix decorations on Windows.
## v0.0.38 - 2024-04-13
- Re-enable Windows.
## v0.0.37 - 2024-04-13
- Add side bar icon.
- Less noisy logs.
## v0.0.36 - 2024-04-12
- Bug fix: fix go-to-definition of include paths to linked project files.
## v0.0.35 - 2024-04-12
- Add support for .h header files.
- Temporarily remove Windows support.
## v0.0.34 - 2024-04-11
- Remove sockets.
## v0.0.32 - 2024-04-10
- Bug fix: Shutdown backend when LSP client becomes inactive.
- Feature: Report diagnostics log for debugging.
## v0.0.31 - 2024-04-09
- Feature: Multi-root project support.
- Feature: Ability to define arbitrary macros.
## v0.0.30 - 2024-04-08
- Windows: Fix go-to-definition.
## v0.0.29 - 2024-04-08
- Partial go-to-definition support: module and include directives.
## v0.0.28 - 2024-04-08
- Show origin of diagnostics.
- Add support .verilog files.
- Easier traceability for backend errors.
## v0.0.27 - 2024-04-05
- Bug fixes relating to resolving dependencies.
## v0.0.26 - 2024-04-04
- Documentation improvements.
- Small optimizations.
## v0.0.25 - 2024-04-01
- Notifications are prefixed appropriately as "HDL copilot".
- Licensing mechanism.
## v0.0.24 - 2024-03-30
- Lint: flag unread / unwritten ports.
- Fix bug where project config was getting overwritten erroneously on project select.
## v0.0.23 - 2024-03-29
- Support for multiple workspaces.
- Improved setup flow: upon selecting project folder, diagnostics are now shown immediately.
- Bug fix: clear old diagnostics in switching project folders.
- Bug fix: obviate ability to exclude/include paths outside project folder path.
- Bug fix: gracefully handle LSP server restart when switching workspaces.
## v0.0.22 - 2024-03-27
- Inclusion bug fix: Including parent directory now includes all files in that directory.
## v0.0.21 - 2024-03-27
- Improved project selection flow: can now select a folder from workspace. If multiple projects are found within current workspace, user is prompted to select one.
## v0.0.20 - 2024-03-26
- Make indexing faster.
- File limit notification.
- Exclusion/inclusion bug fixes.
## v0.0.19 - 2024-03-25
- Add ability to re-include files excluded from compilation.
## v0.0.18 - 2024-03-24
- Add ability to "exclude" files from compilation.
- Fix bug concerning cyclic symlinks.
- Optimize indexing.
- Dismiss diagnostics out of project scope.
- Fix bug that resulted in duplicate actions being shown on lines with multiple (>1) diagnostics.
- Add support for .v (verilog) files.
## v0.0.17 - 2024-03-21
- Windows bug fix related to being able to suppress diagnostics.
## v0.0.16 - 2024-03-21
- Windows x64 support.
## v0.0.15 - 2024-03-20
- Auto-complete improvements (add support for 29 SystemVerilog constructs).
## v0.0.14 - 2024-03-19
- Show warning when file limit is exceeded.
## v0.0.13 - 2024-03-19
- Compilation speed-ups.
- Cap number of scanned files.
## v0.0.12 - 2024-03-19
Bug fixes.
## v0.0.9  - 2024-03-19
- Partial support for auto-complete.
## v0.0.1 - 2024-03-18
- Syntax highlighting, formatting & linting.
