$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$download = Join-Path $env:TEMP "mpv-subseek-ffmpeg.zip"
$extract = Join-Path $env:TEMP "mpv-subseek-ffmpeg"
$destination = Join-Path $projectRoot "vendor\ffmpeg"
$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

Write-Host "Downloading FFmpeg essentials from $url"
Invoke-WebRequest -Uri $url -OutFile $download
Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $download -DestinationPath $extract -Force
$bin = Get-ChildItem $extract -Directory | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName "bin" }
if (-not $bin -or -not (Test-Path (Join-Path $bin "ffmpeg.exe"))) {
  throw "The downloaded archive did not contain the expected FFmpeg binaries."
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item (Join-Path $bin "ffmpeg.exe") $destination -Force
Copy-Item (Join-Path $bin "ffprobe.exe") $destination -Force
Write-Host "Prepared vendor\ffmpeg\ffmpeg.exe and ffprobe.exe"
Write-Host "Review FFmpeg licensing before redistribution: https://ffmpeg.org/legal.html"
