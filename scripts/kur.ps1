# DeckPad ve StudioHub'ı bu bilgisayara tek komutla kurar (Windows):
#   1. DeckPad'in web derlemesi (StudioHub'daki masaüstü penceresi ve OBS paneli)
#   2. StudioHub'ı yayınlar -> C:\Apps\StudioHub, Başlat menüsüne ekler ve açar
#   3. -Apk: DeckPad APK'sini derler ve USB'deki telefona kurar (JDK 17 ve Android SDK gerekir)
# Kullanım: .\scripts\kur.ps1 [-Apk] [-Target C:\Apps\StudioHub]
# Windows açılışında başlaması için StudioHub'daki "Windows ile başlat" anahtarını aç.
# Kaldırmak: o anahtarı kapat, hedef klasörü ve Başlat menüsündeki kısayolu sil.
param([switch]$Apk, [string]$Target = "C:\Apps\StudioHub")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $Root "app")
try {
  if (-not (Test-Path node_modules)) { npm ci; if ($LASTEXITCODE) { throw "npm ci başarısız" } }
  npm run export:panel; if ($LASTEXITCODE) { throw "Panel derlenemedi" }
} finally { Pop-Location }

# Açık StudioHub yayın klasöründeki dosyaları kilitler ve 4466 portunu tutar.
Get-Process StudioHub -ErrorAction SilentlyContinue | Stop-Process
dotnet publish (Join-Path $Root "studiohub\src\StudioHub") -c Release -o $Target
if ($LASTEXITCODE) { throw "StudioHub derlenemedi" }
$Exe = Join-Path $Target "StudioHub.exe"

$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath("Programs")) "StudioHub.lnk"))
$lnk.TargetPath = $Exe
$lnk.WorkingDirectory = $Target
$lnk.Save()
Write-Host "StudioHub kuruldu: $Target (Başlat menüsünde)"

if ($Apk) {
  Push-Location (Join-Path $Root "app")
  try {
    npx expo prebuild -p android --no-install; if ($LASTEXITCODE) { throw "expo prebuild başarısız" }
    Push-Location android
    # Yalnız 64-bit ARM: bugünkü telefonların hepsi; dört mimarinin hepsi derlemeyi ~4 kat uzatır.
    try { .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a; if ($LASTEXITCODE) { throw "APK derlenemedi" } } finally { Pop-Location }
  } finally { Pop-Location }
  # Telefona sonradan elle göndermek için StudioHub'ın yanında da durur.
  $ApkFile = Join-Path $Target "DeckPad.apk"
  Copy-Item (Join-Path $Root "app\android\app\build\outputs\apk\release\app-release.apk") $ApkFile
  $Adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
  # -d: yalnız USB'deki cihaz (açık emülatör karışmaz); -r: varsa verisini silmeden günceller.
  # Telefon yoksa StudioHub yine açılsın diye hata fırlatılmaz.
  & $Adb -d install -r $ApkFile
  if ($LASTEXITCODE) {
    Write-Warning "DeckPad telefona kurulamadı. Telefonu USB ile tak, 'USB hata ayıklama'ya izin ver ve betiği yeniden çalıştır; ya da $ApkFile dosyasını telefona gönderip aç."
  } else { Write-Host "DeckPad telefona kuruldu." }
}

Start-Process $Exe
