# 天气桌面组件

Windows 透明磨砂风格天气小工具，默认挂在**桌面壁纸层**（图标下方），支持拖动、缩放与横/竖条紧凑模式，自适应屏幕缩放。

[English](./README.md) | [问题记录](./docs/TROUBLESHOOTING.zh-CN.md) | [Troubleshooting](./docs/TROUBLESHOOTING.md)

## 功能

- 页面与空白区透明，外框与按钮可见
- 当前天气、逐小时、未来 7 天（Open-Meteo）
- 城市搜索、GPS 定位、IP 定位备选
- 英文 / 简体中文界面（跟随系统，可手动指定）

## 环境要求

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 18 及以上

## 一键安装与运行

1. 下载或克隆本仓库
2. 双击 **`下载安装.bat`** 或 **`install.bat`**，打开安装页面
3. 选择 **界面语言**、**安装位置**，按需勾选 **「创建桌面快捷方式」** 或 **「开机自动启动」**，点击「开始安装」
4. 若创建了快捷方式，从桌面「天气组件」启动；否则到安装目录运行 `scripts\launch.vbs`  
5. 卸载：进入安装目录，双击 **`uninstall.bat`**

在线下载页（可托管到 GitHub Pages）：[`download/index.html`](./download/index.html)

卸载：双击 **`卸载.bat`**，或在安装页面点击「卸载 / 删除」。

## 界面语言

默认跟随系统。手动指定：

```powershell
$env:WIDGET_LANG = "zh-CN"   # 或 en
# 设置后通过桌面快捷方式「天气组件」启动
```

## 可选环境变量

| 变量 | 说明 |
|------|------|
| `WIDGET_FLOAT=1` | 浮窗置顶（不挂壁纸层） |
| `WIDGET_OPAQUE=1` | 不透明窗口 |
| `WIDGET_ENABLE_GPU=1` | 强制开启 GPU |
| `WIDGET_ELECTRON_ARGS` | 额外 Electron 参数 |
| `WIDGET_LANG` | 界面语言 |

## 上架 GitHub

```bash
git init
git add .
git commit -m "首次发布：透明桌面天气组件"
git branch -M main
git remote add origin https://github.com/你的用户名/weather-widget.git
git push -u origin main
```

详细开发问题与修复过程见 [docs/TROUBLESHOOTING.zh-CN.md](./docs/TROUBLESHOOTING.zh-CN.md)。

## 许可证

[MIT](./LICENSE)
