# StudioHub'ı derlemeden önce gerekenleri hazırlar (Windows; Linux/macOS'ta hazirla.sh):
#   1. FFmpeg'i (gyan.dev 9.0.2 essentials, GPL) indirir ve özetini doğrular -> studiohub\vendor\ffmpeg\ffmpeg.exe
#   2. DeckPad'in web derlemesini üretir -> studiohub\web\panel (masaüstü penceresi ve OBS paneli)
# Kullanım: .\scripts\hazirla.ps1 [-NoFfmpeg] [-NoPanel]
param([switch]$NoFfmpeg, [switch]$NoPanel)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$FfVer = "9.0.2"
$FfExeSha256 = "3256173F3F8BFFD7DF12227C68ADF68025EDB1832273A9530688A7BB1ED8EDEC"
$FfUrls = @(
  "https://github.com/GyanD/codexffmpeg/releases/download/$FfVer/ffmpeg-$FfVer-essentials_build.zip",
  "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-$FfVer-essentials_build.zip"
)
$FfDir = Join-Path $Root "studiohub\vendor\ffmpeg"
$FfExe = Join-Path $FfDir "ffmpeg.exe"

if (-not $NoFfmpeg) {
  if ((Test-Path $FfExe) -and ((Get-FileHash $FfExe -Algorithm SHA256).Hash -eq $FfExeSha256)) {
    Write-Host "FFmpeg hazır."
  } else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("ffmpeg-" + [guid]::NewGuid())
    New-Item -ItemType Directory $tmp | Out-Null
    try {
      $zip = Join-Path $tmp "ffmpeg.zip"
      $ok = $false
      foreach ($u in $FfUrls) {
        Write-Host "FFmpeg indiriliyor: $u"
        try { Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing; $ok = $true; break } catch { Write-Warning $_ }
      }
      if (-not $ok) { throw "FFmpeg indirilemedi." }
      Expand-Archive $zip -DestinationPath $tmp -Force
      $src = Get-ChildItem $tmp -Recurse -Filter ffmpeg.exe | Select-Object -First 1
      New-Item -ItemType Directory -Force $FfDir | Out-Null
      Copy-Item $src.FullName $FfExe -Force
      $got = (Get-FileHash $FfExe -Algorithm SHA256).Hash
      if ($got -ne $FfExeSha256) { Remove-Item $FfExe; throw "FFmpeg özeti beklenenden farklı ($got). Dosya silindi." }
      Write-Host "FFmpeg $FfVer hazır."
    } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

if (-not $NoPanel) {
  Push-Location (Join-Path $Root "app")
  try {
    if (-not (Test-Path node_modules)) { npm ci; if ($LASTEXITCODE) { throw "npm ci başarısız" } }
    npm run export:panel; if ($LASTEXITCODE) { throw "Panel derlenemedi" }
    Write-Host "Panel hazır: studiohub\web\panel"
  } finally { Pop-Location }
}

Write-Host "Şimdi: dotnet publish studiohub\src\StudioHub -c Release -o studiohub\out\StudioHub"
