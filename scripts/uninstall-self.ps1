# 在安装目录内运行：清理快捷方式/自启/配置，并删除整个安装文件夹
param(
  [string]$InstallPath = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "widget-config.ps1")

if ([string]::IsNullOrWhiteSpace($InstallPath)) {
  $InstallPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
  $InstallPath = (Resolve-Path -LiteralPath $InstallPath).Path
}

Add-Type -AssemblyName System.Windows.Forms
$isZh = ($env:WIDGET_LANG -like "zh*") -or ($PSUICulture -like "zh*")
$title = "天气组件"
$confirmText = if ($isZh) {
  "确定要卸载吗？`n`n将删除：`n- 桌面快捷方式`n- 开机自启动项`n- 配置文件`n- 整个安装目录：$InstallPath"
} else {
  "Uninstall Weather Widget?`n`nThis removes shortcuts, startup entry, settings, and:`n$InstallPath"
}
$confirm = [System.Windows.Forms.MessageBox]::Show(
  $confirmText,
  $title,
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Warning
)
if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
  exit 0
}

Remove-WidgetDesktopShortcut | Out-Null
Remove-WidgetAutoStart | Out-Null

$configDir = Get-WidgetConfigDir
$localIconDir = Join-Path $env:LOCALAPPDATA "weather-widget"
foreach ($file in @(
  (Get-WidgetSettingsPath),
  (Get-WidgetAppIconPath),
  (Join-Path $localIconDir "app.ico")
)) {
  if ($file -and (Test-Path -LiteralPath $file)) {
    Remove-Item -LiteralPath $file -Force
  }
}

if (Test-Path -LiteralPath $configDir) {
  $left = Get-ChildItem -LiteralPath $configDir -Force -ErrorAction SilentlyContinue
  if (-not $left) {
    Remove-Item -LiteralPath $configDir -Force -ErrorAction SilentlyContinue
  }
}

$cleanupBat = Join-Path $env:TEMP ("weather-widget-uninstall-" + [guid]::NewGuid().ToString("N") + ".cmd")
$batLines = @(
  "@echo off",
  "ping -n 3 127.0.0.1 >nul",
  "rd /s /q `"$InstallPath`"",
  "del /f /q `"%~f0`""
)
$batLines | Set-Content -LiteralPath $cleanupBat -Encoding ASCII
Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "`"$cleanupBat`"") -WindowStyle Hidden

$doneText = if ($isZh) { "卸载已开始，安装目录稍后将被删除。" } else { "Uninstall started. The install folder will be removed shortly." }
Show-WidgetMessage -Text $doneText -Title $title
exit 0
