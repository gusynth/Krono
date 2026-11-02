$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'assets/desktop/brand/principal-256.png'))
try {
  foreach ($item in @(@{Name='installerSidebar.bmp';Width=328;Height=628;X=72;Y=158;Size=184},@{Name='installerHeader.bmp';Width=150;Height=57;X=99;Y=7;Size=43})) {
    $bitmap = [System.Drawing.Bitmap]::new($item.Width,$item.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(24,25,24))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($source,[System.Drawing.Rectangle]::new($item.X,$item.Y,$item.Size,$item.Size))
      if ($item.Width -eq 328) {
        $font = [System.Drawing.Font]::new('Georgia',26,[System.Drawing.FontStyle]::Regular)
        $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(227,230,226))
        $format = [System.Drawing.StringFormat]::new(); $format.Alignment = [System.Drawing.StringAlignment]::Center
        try { $graphics.DrawString('Krono',$font,$brush,[System.Drawing.RectangleF]::new(0,370,328,70),$format) } finally { $font.Dispose();$brush.Dispose();$format.Dispose() }
      }
      $bitmap.Save((Join-Path $projectRoot "build/$($item.Name)"),[System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally { $graphics.Dispose();$bitmap.Dispose() }
  }
} finally { $source.Dispose() }
