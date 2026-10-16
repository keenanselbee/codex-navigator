# Sync the approved, Marketplace-sized artwork without resizing or redrawing it.
$iconRoot = Split-Path -Parent $PSScriptRoot
Copy-Item -LiteralPath (Join-Path $iconRoot 'images/icon-small.png') -Destination (Join-Path $iconRoot 'media/icon.png')
