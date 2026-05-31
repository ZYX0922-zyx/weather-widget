# 问题记录与成功解决方案

本文档汇总天气桌面组件开发过程中遇到的问题及已验证有效的修复方法。

## 1. 鼠标缩放/拖动后粘连

**现象：** 缩放或拖动结束后，鼠标像被窗口边缘吸住，移动卡顿。

**原因：**
- `GetCapture()` 返回值不能直接用 `Number()` 与 HWND 比较
- 全局低层鼠标钩子 `SetWindowsHookExW` 在 Electron + koffi 下易触发 Win32 原生崩溃
- `IsChild()` 调用可能触发 `-144` 崩溃

**成功修复：**
- 使用 `normalizeHwnd()` / `isSameHwnd()` 安全比较句柄
- 移除全局鼠标钩子，改为 16ms 轮询 `pointerHygieneTimer`
- 移除 `IsChild()` 与有风险的 `pumpMainThreadMessages()`

---

## 2. 启动崩溃（`-144` / `crashpad not connected`）

**现象：** 双击启动后闪退，或日志出现 `-36861` / `-144`。

**原因：** Electron 安装不完整、GPU/驱动冲突、Win32 原生模块异常。

**成功修复：**
- `launch.js` 增加预检与可读错误码说明
- 默认透明模式在 Windows 上开启 GPU 合成
- 若仍崩溃：任务管理器结束所有 `electron.exe`，设置  
  `WIDGET_ELECTRON_ARGS=--disable-gpu --no-sandbox`  
  或使用 `WIDGET_OPAQUE=1` 不透明兜底

---

## 3. 窗口看不见

**现象：** 进程在跑、日志有 `show`，但屏幕无内容。

**原因（多次迭代确认）：**
- 关 GPU + 透明窗在 Windows 上常完全不绘制
- 浮窗模式下 `blur` 仍调用 `stripChromeForWindow`，窗口被 `WS_EX_TOOLWINDOW` 隐藏
- `widget-frame` 曾被 `display:none`
- 误把整窗设为不透明，与用户要的「页面透明、边框按钮可见」冲突

**成功修复：**
- 默认挂桌面壁纸层；`WIDGET_FLOAT=1` 才浮窗置顶
- 透明模式默认开 GPU；页面/判定区透明，`.widget-frame` 边框与按钮保留
- 浮窗模式不调用 `stripChrome`；`restoreFloatWindowStyles()` 恢复样式
- 移除 `index.html` 硬编码 `software-render`，由运行时按 GPU 状态切换

---

## 4. launcher 语法错误

**现象：** 桌面快捷方式「天气组件」闪退。

**原因：** `launcher.ps1` 第 50 行 `} else  if` 非法。

**成功修复：** 改为 `} elseif`。

---

## 5. 透明 / 壁纸层 / 浮窗需求混淆

**用户要求：**
- 判定区域透明、页面透明
- 外框与按钮必须可见
- 默认在壁纸层（非最顶层浮窗）

**成功修复：**
- `DESKTOP_ATTACH_ENABLED` 默认 true（`WIDGET_FLOAT=1` 才浮窗）
- `WINDOW_USE_TRANSPARENT` 默认 true（`WIDGET_OPAQUE=1` 才不透明）
- CSS 恢复 `.widget-frame` 描边；software-render 仅给面板/按钮补色

---

## 6. 拖动窗口闪烁

**现象：** 移动窗口时画面抖动。

**原因：**
- IPC 与定时器双重更新位置
- 拖动时 `blur` 触发 `stripChrome`
- 桌面层定时重挂载 + 重复 `setBounds`
- 原生拖动后 Electron `getBounds()`  stale，松手时被同步回旧尺寸

**成功修复：**
- 位置更新统一由 `dragWatch` 处理
- 拖动/缩放中跳过 `blur` 的 chrome 刷新
- 松手前 `syncElectronBoundsFromNative()` 再判定模式
- 已挂载桌面层时减少重复 `attachToDesktop`

---

## 7. 关闭后命令行不退出

**现象：** 点关闭后黑色 PowerShell 窗口仍在。

**原因：** 成功退出后 `Read-Host` 等待按键。

**成功修复：** 正常退出时 launcher 直接 `exit 0`；主进程 `destroy` + `app.quit()`。

---

## 8. 缩小到条带模式后弹回正常窗口

**现象：** 缩到竖条/横条 compact 后松手又变回大窗。

**原因：** `syncElectronBoundsFromNative()` 用 `Math.max(NORMAL_MIN_WIDTH, width)` 把竖条宽度强行抬到 260+。

**成功修复：**
- 按条带模式使用不同最小宽高（竖条宽 80、横条最小宽 400）
- 松手前先同步原生尺寸再 `resolveWindowMode`
- 横条 compact 扩宽时只改 `width`，不改 `height`

---

## 9. 早期功能类问题（已稳定）

| 问题 | 修复 |
|------|------|
| 天气图标 404 | 本地 SVG `icons.js` |
| 定位失败 | Electron 地理权限 + IP 定位 + BigDataCloud 逆地理 |
| 搜索按钮无反应 | 按钮移出 loading 隐藏区域，提高 z-index |
| 加载时全部按钮旋转 | 仅 `#btnRefresh` 旋转 |
| 顶部白色标题条 | 去标题栏，空 title + 隐藏菜单 |
| 150% DPI 拖动不同步 | `display-scale.js` + 主进程统一坐标换算 |
| koffi HWND BigInt 崩溃 | Buffer 读句柄数值，不用错误 `koffi.as` |

---

## 环境变量速查

| 变量 | 作用 |
|------|------|
| `WIDGET_FLOAT=1` | 浮窗置顶（非壁纸层） |
| `WIDGET_OPAQUE=1` | 不透明窗口 |
| `WIDGET_ENABLE_GPU=1` | 强制开启 GPU |
| `WIDGET_ELECTRON_ARGS` | 额外 Electron 参数 |
| `WIDGET_LANG` | UI 语言 `en` / `zh-CN` |

---

## 请勿回退的已知危险改动

- 不要在浮窗/默认模式下对 `blur` 调用 `stripChromeForWindow`
- 不要恢复全局低层鼠标钩子
- 不要用 `Number(captureHwnd)` 直接比较句柄
- 不要恢复 `IsChild()` 调用
