# 安装核心逻辑：复制到目标目录、npm、图标、快捷方式
param(
  [string]$SourceRoot = "",
  [Parameter(Mandatory = $true)][string]$InstallPath,
  [Parameter(Mandatory = $true)][string]$Lang,
  [switch]$CreateShortcut,
  [switch]$AutoStart
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Join-Path $PSScriptRoot ".."
}
. (Join-Path $PSScriptRoot "widget-config.ps1")

$SourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
$InstallPath = $InstallPath.Trim()
if ([string]::IsNullOrWhiteSpace($InstallPath)) {
  throw "Install path is empty"
}

if (-not (Test-Path -LiteralPath $InstallPath)) {
  New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}
$InstallPath = (Resolve-Path -LiteralPath $InstallPath).Path

function Copy-WidgetProject {
  param(
    [string]$From,
    [string]$To
  )

  if ($From -eq $To) { return }

  $excludeDirs = @("node_modules", ".git", ".electron-cache")
  $robocopy = Join-Path $env:SystemRoot "System32\robocopy.exe"
  $xd = ($excludeDirs | ForEach-Object { "/XD"; $_ }) -join " "
  $cmd = "`"$robocopy`" `"$From`" `"$To`" /E /COPY:DAT /R:1 /W:1 $xd /NFL /NDL /NJH /NJS /NC /NS"
  cmd /c $cmd | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "File copy failed, robocopy exit code: $LASTEXITCODE"
  }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js / npm not found"
}

Copy-WidgetProject -From $SourceRoot -To $InstallPath

Push-Location -LiteralPath $InstallPath
try {
  $env:WIDGET_LANG = $Lang
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed, exit code: $LASTEXITCODE"
  }

  $buildIcon = Join-Path $InstallPath "scripts\build-icon.ps1"
  if (-not (Test-Path -LiteralPath $buildIcon)) {
    throw "Missing build-icon.ps1"
  }
  & $buildIcon -Root $InstallPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Icon build failed"
  }
  $appDataIcon = Get-WidgetAppIconPath
  if (-not (Test-Path -LiteralPath $appDataIcon)) {
    throw "Missing app icon: $appDataIcon"
  }

  Save-WidgetSettings -InstallPath $InstallPath -Lang $Lang -CreateDesktopShortcut:$CreateShortcut.IsPresent -AutoStart:$AutoStart.IsPresent

  $shortcutPath = $null
  if ($CreateShortcut.IsPresent) {
    $shortcutPath = New-WidgetDesktopShortcut -InstallPath $InstallPath
  } else {
    Remove-WidgetDesktopShortcut | Out-Null
  }

  $startupPath = $null
  if ($AutoStart.IsPresent) {
    $startupPath = Enable-WidgetAutoStart -InstallPath $InstallPath
  } else {
    Remove-WidgetAutoStart | Out-Null
  }

  [pscustomobject]@{
    ok                     = $true
    installPath            = $InstallPath
    shortcutPath           = $shortcutPath
    startupPath            = $startupPath
    createDesktopShortcut  = $CreateShortcut.IsPresent
    autoStart              = $AutoStart.IsPresent
    iconPath               = $appDataIcon
    lang                   = $Lang
  }
} finally {
  Pop-Location
}
