param(
  [string]$Version = ""
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Version)) {
  $versionFile = Join-Path $PSScriptRoot "..\..\..\VERSION"
  $Version = (Get-Content $versionFile -Raw).Trim()
}
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\..\src-tauri\installer"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-VitrBitmap {
  param(
    [string]$Path,
    [int]$Width,
    [int]$Height,
    [ValidateSet('sidebar','header','dialog','banner')]
    [string]$Kind
  )

  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $rect = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)
  $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect,
    [System.Drawing.Color]::FromArgb(28, 29, 31),
    [System.Drawing.Color]::FromArgb(5, 5, 7),
    [single]115
  )
  $graphics.FillRectangle($bg, $rect)

  $glow = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect,
    [System.Drawing.Color]::FromArgb(60, 240, 47, 88),
    [System.Drawing.Color]::FromArgb(0, 189, 5, 52),
    [single]40
  )
  $graphics.FillEllipse($glow, [int](-$Width * .25), [int]($Height * .48), [int]($Width * .95), [int]($Height * .65))

  $compact = $Kind -in @('header','banner')
  if ($Kind -eq 'header') {
    # NSIS header artwork is only 150x57. Keep this intentionally minimal
    # so branding never clips inside the fixed installer slot.
    $dropX = 14
    $dropY = 11
    $dropW = 28
    $dropH = 34
  } elseif ($Kind -eq 'banner') {
    $dropX = 22
    $dropY = [Math]::Max(7, [int](($Height - 42) / 2))
    $dropW = 34
    $dropH = 42
  } else {
    $dropW = [int]([Math]::Min($Width * .52, $Height * .28))
    $dropH = [int]($dropW * 1.18)
    $dropX = [int](($Width - $dropW) / 2)
    $dropY = [int]($Height * .16)
  }

  $dropPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $cx = [single]($dropX + $dropW / 2)
  $top = [single]$dropY
  $bottom = [single]($dropY + $dropH)
  $left = [single]$dropX
  $right = [single]($dropX + $dropW)

  $dropPath.StartFigure()
  $dropPath.AddBezier($cx, $top, [single]($cx - $dropW*.10), [single]($dropY + $dropH*.16), [single]($left + $dropW*.08), [single]($dropY + $dropH*.48), $left, [single]($dropY + $dropH*.62))
  $dropPath.AddBezier($left, [single]($dropY + $dropH*.62), [single]($left + $dropW*.02), [single]($dropY + $dropH*.84), [single]($cx - $dropW*.18), $bottom, $cx, $bottom)
  $dropPath.AddBezier($cx, $bottom, [single]($cx + $dropW*.20), $bottom, [single]($right - $dropW*.02), [single]($dropY + $dropH*.84), $right, [single]($dropY + $dropH*.62))
  $dropPath.AddBezier($right, [single]($dropY + $dropH*.62), [single]($right - $dropW*.08), [single]($dropY + $dropH*.48), [single]($cx + $dropW*.10), [single]($dropY + $dropH*.16), $cx, $top)
  $dropPath.CloseFigure()

  $dropRect = [System.Drawing.RectangleF]::new([single]$dropX, [single]$dropY, [single]$dropW, [single]$dropH)
  $dropBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $dropRect,
    [System.Drawing.Color]::FromArgb(242, 49, 89),
    [System.Drawing.Color]::FromArgb(188, 5, 52),
    [single]95
  )
  $graphics.FillPath($dropBrush, $dropPath)

  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(246, 246, 248))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(165, 165, 172))
  $red = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(238, 39, 78))

  if ($Kind -eq 'header') {
    $titleFont = [System.Drawing.Font]::new("Segoe UI", [single]12, [System.Drawing.FontStyle]::Bold)
    $smallFont = [System.Drawing.Font]::new("Segoe UI", [single]6.3, [System.Drawing.FontStyle]::Regular)
    $graphics.DrawString("vitr", $titleFont, $white, [single]52, [single]10)
    $graphics.DrawString("$Version  •  BY BLOOD", $smallFont, $muted, [single]53, [single]31)
    $titleFont.Dispose()
    $smallFont.Dispose()
  } elseif ($Kind -eq 'banner') {
    $titleFont = [System.Drawing.Font]::new("Segoe UI", [single]13, [System.Drawing.FontStyle]::Bold)
    $smallFont = [System.Drawing.Font]::new("Segoe UI", [single]7.5, [System.Drawing.FontStyle]::Regular)
    $textY = [single]([Math]::Max(7, ($Height-31)/2))
    $graphics.DrawString("vitr setup", $titleFont, $white, [single]72, $textY)
    $graphics.DrawString("$Version  •  BY BLOOD", $smallFont, $muted, [single]73, [single]([Math]::Max(26, ($Height-31)/2 + 21)))
    $accentPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(235, 30, 72), [single]2)
    $graphics.DrawLine($accentPen, $Width - 74, [int]($Height/2), $Width - 18, [int]($Height/2))
    $accentPen.Dispose()
    $titleFont.Dispose()
    $smallFont.Dispose()
  } else {
    $titleFont = [System.Drawing.Font]::new("Segoe UI", [single]([Math]::Max(18, $Width*.13)), [System.Drawing.FontStyle]::Bold)
    $smallFont = [System.Drawing.Font]::new("Segoe UI", [single]([Math]::Max(8, $Width*.045)), [System.Drawing.FontStyle]::Regular)
    $tagFont = [System.Drawing.Font]::new("Segoe UI", [single]([Math]::Max(7, $Width*.040)), [System.Drawing.FontStyle]::Bold)
    $titleY = [single]($dropY + $dropH + $Height*.07)
    $graphics.DrawString("vitr", $titleFont, $white, [single]($Width*.12), $titleY)
    $graphics.DrawString("MUSIC IN MOTION", $tagFont, $red, [single]($Width*.13), [single]($titleY + $Height*.11))
    $graphics.DrawString("Standalone music interface.", $smallFont, $muted, [single]($Width*.13), [single]($titleY + $Height*.18))
    $graphics.DrawString("Vitr $Version", $smallFont, $muted, [single]($Width*.13), [single]($Height*.91))
    $titleFont.Dispose()
    $smallFont.Dispose()
    $tagFont.Dispose()
  }

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)

  $white.Dispose()
  $muted.Dispose()
  $red.Dispose()
  $dropBrush.Dispose()
  $dropPath.Dispose()
  $glow.Dispose()
  $bg.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-VitrBitmap -Path (Join-Path $outDir "vitr-nsis-header.bmp") -Width 150 -Height 57 -Kind header
New-VitrBitmap -Path (Join-Path $outDir "vitr-nsis-sidebar.bmp") -Width 164 -Height 314 -Kind sidebar
New-VitrBitmap -Path (Join-Path $outDir "vitr-wix-banner.bmp") -Width 493 -Height 58 -Kind banner
New-VitrBitmap -Path (Join-Path $outDir "vitr-wix-dialog.bmp") -Width 493 -Height 312 -Kind dialog

Write-Host "Generated branded Vitr installer artwork in $outDir"
