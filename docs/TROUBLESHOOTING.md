# Troubleshooting & Development Notes

This document records issues encountered during development and the solutions that worked.

[中文完整版](./TROUBLESHOOTING.zh-CN.md)

## Quick reference

| Issue | Solution |
|-------|----------|
| Window invisible after start | Default: desktop layer + transparent window needs GPU; see env vars below |
| `-144` / crash on startup | End all `electron.exe`, use `WIDGET_ELECTRON_ARGS=--disable-gpu --no-sandbox` |
| Mouse sticks to window edge after resize | Fixed via safe HWND compare + pointer hygiene polling (no global mouse hook) |
| Strip mode snaps back to normal | Sync native bounds before mode resolve; strip min width 400 for horizontal compact |
| Command window stays open after close | Launcher exits automatically on success |
| `launcher.ps1` syntax error | Use `} elseif` not `} else if` |

## Environment variables

| Variable | Effect |
|----------|--------|
| `WIDGET_FLOAT=1` | Floating always-on-top window instead of desktop wallpaper layer |
| `WIDGET_OPAQUE=1` | Opaque window (disables transparency, allows GPU-off mode) |
| `WIDGET_ENABLE_GPU=1` | Force GPU on Windows |
| `WIDGET_ELECTRON_ARGS` | Extra Electron CLI args, e.g. `--disable-gpu --no-sandbox` |
| `WIDGET_LANG=en` / `zh-CN` | Override UI language |

## Architecture (Windows)

- **Electron** renderer: frosted glass UI, weather data
- **desktop-win.js**: mount window to `WorkerW` (wallpaper layer, below desktop icons)
- **koffi**: Win32 APIs for desktop attach, native drag/resize, mouse pass-through

## Related docs

- [CHANGELOG](./CHANGELOG.md)
- [README (English)](../README.md)
- [README (中文)](../README.zh-CN.md)
