#!/usr/bin/env bash
# StudioHub'ı derlemeden önce gerekenleri hazırlar (Linux/macOS; Windows'ta hazirla.ps1):
#   1. FFmpeg'i (gyan.dev 9.0.2 essentials, GPL) indirir ve özetini doğrular → studiohub/vendor/ffmpeg/ffmpeg.exe
#   2. DeckPad'in web derlemesini üretir → studiohub/web/panel (masaüstü penceresi ve OBS paneli)
# Kullanım: scripts/hazirla.sh [--no-ffmpeg] [--no-panel]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FF_VER=9.0.2
FF_EXE_SHA256=3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec
FF_URLS=(
  "https://github.com/GyanD/codexffmpeg/releases/download/${FF_VER}/ffmpeg-${FF_VER}-essentials_build.zip"
  "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-${FF_VER}-essentials_build.zip"
)
FF_DIR="$ROOT/studiohub/vendor/ffmpeg"

want_ffmpeg=1; want_panel=1
for a in "$@"; do
  case "$a" in
    --no-ffmpeg) want_ffmpeg=0 ;;
    --no-panel) want_panel=0 ;;
    *) echo "Bilinmeyen seçenek: $a" >&2; exit 2 ;;
  esac
done

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

if [ $want_ffmpeg = 1 ]; then
  if [ -f "$FF_DIR/ffmpeg.exe" ] && [ "$(sha256 "$FF_DIR/ffmpeg.exe")" = "$FF_EXE_SHA256" ]; then
    echo "FFmpeg hazır."
  else
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    ok=0
    for u in "${FF_URLS[@]}"; do
      echo "FFmpeg indiriliyor: $u"
      if curl -fL --retry 3 -o "$tmp/ffmpeg.zip" "$u"; then ok=1; break; fi
    done
    [ $ok = 1 ] || { echo "FFmpeg indirilemedi." >&2; exit 1; }
    unzip -j -o -q "$tmp/ffmpeg.zip" "*/bin/ffmpeg.exe" -d "$FF_DIR"
    got="$(sha256 "$FF_DIR/ffmpeg.exe")"
    if [ "$got" != "$FF_EXE_SHA256" ]; then
      rm -f "$FF_DIR/ffmpeg.exe"
      echo "FFmpeg özeti beklenenden farklı ($got). Dosya silindi." >&2; exit 1
    fi
    echo "FFmpeg $FF_VER hazır."
  fi
fi

if [ $want_panel = 1 ]; then
  cd "$ROOT/app"
  [ -d node_modules ] || npm ci
  npm run export:panel
  echo "Panel hazır: studiohub/web/panel"
fi

echo "Şimdi: dotnet publish studiohub/src/StudioHub -c Release -o studiohub/out/StudioHub"
