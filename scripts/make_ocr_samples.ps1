# Renders the synthetic payment screenshots in eval/ocr/specs.json (fake values only) and
# writes eval/ocr/truth.json. Windows PowerShell 5.1: powershell -File scripts/make_ocr_samples.ps1
param(
  [string]$Spec = "$PSScriptRoot\..\eval\ocr\specs.json",
  [string]$OutDir = "$PSScriptRoot\..\eval\ocr\images"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null

$specData = Get-Content -Raw -Encoding UTF8 $Spec | ConvertFrom-Json  # not $spec: PS names ignore case
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(32, 33, 36))
$truth = [ordered]@{}

foreach ($sample in $specData.samples) {
  $bmp = New-Object System.Drawing.Bitmap 720, 1280
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::White)
  $y = 110
  foreach ($line in $sample.lines) {
    $text = [string]$line[0]; $size = [single]$line[1]; $bold = [bool]$line[2]
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    # Nirmala UI covers Devanagari and Tamil; Segoe UI for everything else.
    $family = if ($text -match '\p{IsDevanagari}|\p{IsTamil}') { "Nirmala UI" } else { "Segoe UI" }
    $font = New-Object System.Drawing.Font($family, $size, $style)
    if ($text) { $g.DrawString($text, $font, $dark, 60, $y) }
    $font.Dispose()
    $y += [int]($size * 2.1)
  }
  $path = Join-Path $OutDir $sample.file
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
  $params = New-Object System.Drawing.Imaging.EncoderParameters 1
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]90)
  $bmp.Save($path, $codec, $params)
  $g.Dispose(); $bmp.Dispose()
  $truth[$sample.file] = $sample.truth
  "rendered $($sample.file)"
}

$json = $truth | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path (Split-Path $OutDir) "truth.json"), $json, (New-Object System.Text.UTF8Encoding $false))
"wrote truth.json"
