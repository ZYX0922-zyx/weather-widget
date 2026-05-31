# 生成透明底多云图标（仅云朵，无背景色块）
param(
  [string]$Root = (Join-Path $PSScriptRoot "..")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$pngPath = Join-Path $Root "assets\icon.png"
$buildJs = Join-Path $PSScriptRoot "build-icon.js"

function New-TransparentCloudBitmap {
  param([int]$Size = 256)

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $scale = $Size / 256.0
    $cloudWhite = [System.Drawing.Color]::FromArgb(255, 252, 253, 255)
    $cloudLight = [System.Drawing.Color]::FromArgb(255, 238, 242, 248)
    $brushWhite = New-Object System.Drawing.SolidBrush $cloudWhite
    $brushLight = New-Object System.Drawing.SolidBrush $cloudLight

    try {
      $ellipses = @(
        @{ Brush = $brushLight; X = 118; Y = 88; W = 62; H = 38 },
        @{ Brush = $brushLight; X = 148; Y = 78; W = 72; H = 46 },
        @{ Brush = $brushLight; X = 178; Y = 90; W = 58; H = 36 },
        @{ Brush = $brushLight; X = 132; Y = 104; W = 88; H = 34 },
        @{ Brush = $brushWhite; X = 78; Y = 118; W = 70; H = 44 },
        @{ Brush = $brushWhite; X = 108; Y = 108; W = 82; H = 52 },
        @{ Brush = $brushWhite; X = 142; Y = 112; W = 78; H = 48 },
        @{ Brush = $brushWhite; X = 168; Y = 122; W = 64; H = 40 },
        @{ Brush = $brushWhite; X = 96; Y = 138; W = 96; H = 36 }
      )

      foreach ($item in $ellipses) {
        $graphics.FillEllipse(
          $item.Brush,
          [single]($item.X * $scale),
          [single]($item.Y * $scale),
          [single]($item.W * $scale),
          [single]($item.H * $scale)
        )
      }
    } finally {
      $brushWhite.Dispose()
      $brushLight.Dispose()
    }
  } finally {
    $graphics.Dispose()
  }

  return $bitmap
}

$bitmap = New-TransparentCloudBitmap -Size 256
try {
  $dir = Split-Path $pngPath -Parent
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $bitmap.Dispose()
}

if (-not (Test-Path -LiteralPath $buildJs)) {
  Write-Error "Missing build script: $buildJs"
}

$node = Get-Command node -ErrorAction Stop
& $node.Source $buildJs $Root
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Output (Join-Path $env:APPDATA "weather-widget\app.ico")
