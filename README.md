# Weather Widget

A transparent, frosted-glass weather widget for **Windows**. It lives on the desktop wallpaper layer (below icons), supports resize-to-compact strip modes, and adapts to display scaling.

[中文说明](./README.zh-CN.md) | [Troubleshooting](./docs/TROUBLESHOOTING.md) | [问题记录（中文）](./docs/TROUBLESHOOTING.zh-CN.md)

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## Features

- Transparent window with visible frame and glass-style controls
- Mounts to desktop wallpaper layer (WorkerW), not always-on-top by default
- Current weather, hourly and 7-day forecast (Open-Meteo)
- City search, GPS + IP geolocation
- Drag, resize, vertical/horizontal compact modes
- UI languages: **English** / **简体中文** (auto-detected)

## Requirements

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 18+ (includes npm)

## One-click install & run

### Windows (recommended)

1. Clone or download this repository
2. Run **`下载安装.bat`** or **`install.bat`** to open the install wizard
3. Choose **UI language**, **install folder**, optionally check **Create desktop shortcut** or **Start automatically on login**, then click Install
4. If a shortcut was created, launch from the desktop; otherwise run `scripts\launch.vbs` in the install folder

Download page: [`download/index.html`](./download/index.html)

Uninstall: run **`卸载.bat`** or use Uninstall in the setup wizard.

## Language

The UI follows your system locale. Override:

```powershell
$env:WIDGET_LANG = "en"      # or zh-CN
# Then launch via the desktop shortcut
```

## Optional environment variables

| Variable | Description |
|----------|-------------|
| `WIDGET_FLOAT=1` | Floating window (always on top) instead of desktop layer |
| `WIDGET_OPAQUE=1` | Opaque window background |
| `WIDGET_ENABLE_GPU=1` | Force GPU acceleration |
| `WIDGET_ELECTRON_ARGS` | Extra Electron flags, e.g. `--disable-gpu --no-sandbox` |
| `WIDGET_LANG` | UI language: `en`, `zh-CN` |

## Project structure

```
weather-widget/
├── main.js              # Electron main process
├── desktop-win.js       # Win32 desktop layer & native input
├── launch.js            # Startup wrapper with diagnostics
├── src/
│   ├── index.html
│   ├── css/style.css
│   └── js/              # UI, weather, i18n
├── scripts/             # install & shortcut launcher
├── docs/                # Troubleshooting & changelog
└── install.bat          # One-click install (creates desktop shortcut)
```

## Publish to GitHub

```bash
git init
git add .
git commit -m "Initial release: transparent desktop weather widget"
git branch -M main
git remote add origin https://github.com/ZYX0922-zyx/weather-widget.git
git push -u origin main
```

Replace `ZYX0922-zyx` with your GitHub account.

## License

[MIT](./LICENSE)

## Data sources

- [Open-Meteo](https://open-meteo.com/) – weather & geocoding
- [BigDataCloud](https://www.bigdatacloud.com/) – reverse geocoding
