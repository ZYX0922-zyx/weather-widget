# weather widget launcher (UTF-8 with BOM for Windows PowerShell)
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot "scripts\widget-config.ps1")

Apply-WidgetLanguageFromSettings
$env:WIDGET_SILENT = "1"

$isZh = ($env:WIDGET_LANG -like "zh*") -or ($PSUICulture -like "zh*")

function Show-ErrorBox($en, $zh) {
  $text = if ($isZh) { $zh } else { $en }
  Show-WidgetMessage -Text $text
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Show-ErrorBox "npm not found. Install Node.js from https://nodejs.org/" "未找到 npm，请先安装 Node.js: https://nodejs.org/"
  exit 1
}

if (-not (Test-Path "node_modules\electron\cli.js")) {
  npm install
  if ($LASTEXITCODE -ne 0) {
    Show-ErrorBox "Install failed." "依赖安装失败"
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path "node_modules\electron\dist\electron.exe")) {
  node "node_modules\electron\install.js"
  if (-not (Test-Path "node_modules\electron\dist\electron.exe")) {
    Show-ErrorBox "Electron install incomplete. Run install again." "Electron 安装不完整，请重新运行安装程序"
    exit 1
  }
}

$nodeCmd = (Get-Command node -ErrorAction Stop).Source
$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = $nodeCmd
$pinfo.Arguments = "launch.js"
$pinfo.WorkingDirectory = $PSScriptRoot
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true
$pinfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$proc = [System.Diagnostics.Process]::Start($pinfo)
$proc.WaitForExit()
$code = $proc.ExitCode

# 静默启动：正常关闭时不弹错误（异常 NTSTATUS 由 launch.js 归零）
if ($code -ne 0 -and $code -gt 0 -and $code -lt 256) {
  $detail = if ($isZh) { "启动失败，错误码: $code" } else { "Start failed, code: $code" }
  Show-WidgetMessage -Text $detail
  exit $code
}

exit 0
