# 天气组件：安装配置与快捷方式（UTF-8 with BOM）

function Get-WidgetConfigDir {
  Join-Path $env:APPDATA "weather-widget"
}

function Get-WidgetSettingsPath {
  Join-Path (Get-WidgetConfigDir) "settings.json"
}

function Get-WidgetAppIconPath {
  Join-Path (Get-WidgetConfigDir) "app.ico"
}

function Get-WidgetLocalIconPath {
  Join-Path (Join-Path $env:LOCALAPPDATA "weather-widget") "app.ico"
}

function Resolve-WidgetIconPath {
  param(
    [Parameter(Mandatory = $true)][string]$InstallPath
  )

  $candidates = @(
    (Get-WidgetLocalIconPath),
    (Get-WidgetAppIconPath),
    (Join-Path $InstallPath "assets\icon.ico")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "Missing icon file for shortcuts"
}

function Get-IconPathForShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$IconPath
  )

  try {
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $shortPath = $fso.GetFile($IconPath).ShortPath
    if ($shortPath) {
      return $shortPath
    }
  } catch {
    # 无法生成 8.3 短路径时回退原路径
  }

  return $IconPath
}

function Get-WidgetSettings {
  $path = Get-WidgetSettingsPath
  if (-not (Test-Path -LiteralPath $path)) {
    return @{}
  }
  try {
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
    return ($raw | ConvertFrom-Json)
  } catch {
    return @{}
  }
}

function Save-WidgetSettings {
  param(
    [string]$InstallPath,
    [string]$Lang,
    [bool]$CreateDesktopShortcut = $false,
    [bool]$AutoStart = $false
  )

  $dir = Get-WidgetConfigDir
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  $payload = [ordered]@{
    installPath            = $InstallPath
    lang                   = if ($Lang -like "zh*") { "zh-CN" } else { "en" }
    createDesktopShortcut  = [bool]$CreateDesktopShortcut
    autoStart              = [bool]$AutoStart
    updatedAt              = (Get-Date).ToString("o")
  }

  ($payload | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath (Get-WidgetSettingsPath) -Encoding UTF8
}

function Apply-WidgetLanguageFromSettings {
  $settings = Get-WidgetSettings
  if ($settings.lang) {
    $lang = [string]$settings.lang
    if ($lang -eq "en" -or $lang -like "zh*") {
      $env:WIDGET_LANG = $lang
    }
  }
}

function Get-DefaultInstallPath {
  param([string]$SourceRoot)
  $settings = Get-WidgetSettings
  if ($settings.installPath -and (Test-Path -LiteralPath $settings.installPath)) {
    return [string]$settings.installPath
  }
  return (Join-Path ${env:LOCALAPPDATA} "Programs\WeatherWidget")
}

function Get-WidgetDesktopShortcutPath {
  $desktop = [Environment]::GetFolderPath("Desktop")
  Join-Path $desktop "天气组件.lnk"
}

function Get-WidgetStartupShortcutPath {
  $startup = [Environment]::GetFolderPath("Startup")
  Join-Path $startup "天气组件.lnk"
}

function New-WidgetLaunchShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$ShortcutPath,
    [Parameter(Mandatory = $true)][string]$InstallPath,
    [Parameter(Mandatory = $true)][string]$IconPath
  )

  $launchVbs = Join-Path $InstallPath "scripts\launch.vbs"
  if (-not (Test-Path -LiteralPath $launchVbs)) {
    throw "Missing launch script: $launchVbs"
  }

  $resolvedIcon = Resolve-WidgetIconPath -InstallPath $InstallPath
  $iconForLink = Get-IconPathForShortcut -IconPath $resolvedIcon

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  # 直接指向 vbs，避免 wscript 默认图标干扰
  $shortcut.TargetPath = $launchVbs
  $shortcut.Arguments = ""
  $shortcut.WorkingDirectory = $InstallPath
  $shortcut.IconLocation = "$iconForLink,0"
  $shortcut.Description = "天气组件"
  $shortcut.Save()

  return $ShortcutPath
}

function New-WidgetDesktopShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$InstallPath,
    [string]$IconPath = ""
  )

  if ([string]::IsNullOrWhiteSpace($IconPath)) {
    $IconPath = Resolve-WidgetIconPath -InstallPath $InstallPath
  }

  return New-WidgetLaunchShortcut -ShortcutPath (Get-WidgetDesktopShortcutPath) -InstallPath $InstallPath -IconPath $IconPath
}

function Enable-WidgetAutoStart {
  param(
    [Parameter(Mandatory = $true)][string]$InstallPath,
    [string]$IconPath = ""
  )

  if ([string]::IsNullOrWhiteSpace($IconPath)) {
    $IconPath = Resolve-WidgetIconPath -InstallPath $InstallPath
  }

  return New-WidgetLaunchShortcut -ShortcutPath (Get-WidgetStartupShortcutPath) -InstallPath $InstallPath -IconPath $IconPath
}

function Remove-WidgetDesktopShortcut {
  $shortcutPath = Get-WidgetDesktopShortcutPath
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
    return $true
  }
  return $false
}

function Remove-WidgetAutoStart {
  $shortcutPath = Get-WidgetStartupShortcutPath
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
    return $true
  }
  return $false
}

function Show-WidgetMessage {
  param(
    [string]$Text,
    [string]$Title = "天气组件"
  )
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($Text, $Title) | Out-Null
}
