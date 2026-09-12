# Original geometric artwork; no third-party logo or font assets.
# Rebuild the Marketplace PNG using Windows System.Drawing.
Add-Type -AssemblyName System.Drawing
$iconRoot = Split-Path -Parent $PSScriptRoot
$bitmap = New-Object System.Drawing.Bitmap 1024, 1024
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.ScaleTransform(4, 4)
$background = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#172B3A'))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#74E2C4'))
$line = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#74E2C4')), 10
$line.StartCap = $line.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$bubble = New-Object System.Drawing.Drawing2D.GraphicsPath
try {
    $bubble.AddArc(12, 12, 56, 56, 180, 90)
    $bubble.AddArc(188, 12, 56, 56, 270, 90)
    $bubble.AddArc(188, 156, 56, 56, 0, 90)
    $bubble.AddLine(216, 212, 96, 212)
    $bubble.AddLine(96, 212, 44, 246)
    $bubble.AddLine(44, 246, 44, 210)
    $bubble.AddArc(12, 156, 56, 56, 90, 90)
    $bubble.CloseFigure()
    $graphics.FillPath($background, $bubble)
    $graphics.DrawLine($line, 90, 78, 90, 164)
    $graphics.DrawBezier($line, 90, 143, 90, 109, 166, 143, 166, 91)
    foreach ($point in @(@(90, 74), @(90, 167), @(166, 75))) {
        $graphics.FillEllipse($accent, ($point[0] - 16), ($point[1] - 16), 32, 32)
        $graphics.FillEllipse($background, ($point[0] - 7), ($point[1] - 7), 14, 14)
    }
    $small = New-Object System.Drawing.Bitmap 256, 256
    $resizer = [System.Drawing.Graphics]::FromImage($small)
    try {
        $resizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $resizer.DrawImage($bitmap, 0, 0, 256, 256)
        $small.Save((Join-Path $iconRoot 'media/icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $resizer.Dispose(); $small.Dispose() }
} finally {
    $bubble.Dispose(); $line.Dispose(); $accent.Dispose(); $background.Dispose()
    $graphics.Dispose(); $bitmap.Dispose()
}
