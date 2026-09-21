#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Pipeline do vídeo do hero — Dr. Plínio Mota
#  Requer ffmpeg no PATH:  winget install --id Gyan.FFmpeg -e
#
#  Uso:
#    ./hero-video.sh contatos              # gera mosaicos de frames p/ escolher os takes
#    ./hero-video.sh corta <arquivo> <ini> <dur>
#                                          # ex.: ./hero-video.sh corta videoheader3.mp4 1.2 9
# ═══════════════════════════════════════════════════════════
set -euo pipefail

RAW="$(cd "$(dirname "$0")/../../video" && pwd)"
OUT="$(cd "$(dirname "$0")/../assets/video" && pwd)"
IMG="$(cd "$(dirname "$0")/../assets/img" && pwd)"
TMP="${TMPDIR:-/tmp}/plinio-hero"

command -v ffmpeg >/dev/null || { echo "ffmpeg não encontrado no PATH."; exit 1; }

contatos() {
  mkdir -p "$TMP"
  echo "Gerando mosaicos em $TMP"
  for f in "$RAW"/*.mp4; do
    b="$(basename "$f" .mp4)"
    # 1 frame por segundo, grade 5x4, 320px de largura por célula
    ffmpeg -y -loglevel error -i "$f" \
      -vf "fps=1,scale=320:-2,tile=5x4" -frames:v 1 \
      "$TMP/contato-$b.jpg"
    echo "  ✓ $b"
  done
  echo "Pronto. Abra os arquivos contato-*.jpg para escolher os melhores trechos."
}

corta() {
  local src="$1" ini="$2" dur="$3"
  [ -f "$RAW/$src" ] || { echo "Não achei $RAW/$src"; exit 1; }
  mkdir -p "$OUT"

  echo "Cortando $src  início=${ini}s  duração=${dur}s"

  # ── MOBILE / DESKTOP: 9:16, 720x1280 ──────────────────────
  # O hero usa moldura retrato no desktop e full-bleed no mobile,
  # então o mesmo 9:16 serve aos dois. Sem áudio (autoplay mudo).
  ffmpeg -y -loglevel error -ss "$ini" -t "$dur" -i "$RAW/$src" \
    -an -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p" \
    -c:v libx264 -profile:v main -level 4.0 -crf 26 -preset slow \
    -movflags +faststart -g 60 \
    "$OUT/hero-mobile.mp4"
  cp "$OUT/hero-mobile.mp4" "$OUT/hero-desktop.mp4"

  # ── POSTER: primeiro frame, usado enquanto o vídeo carrega ─
  ffmpeg -y -loglevel error -ss "$ini" -i "$RAW/$src" \
    -frames:v 1 -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" \
    -q:v 4 "$IMG/hero-poster.jpg"

  echo
  ls -lh "$OUT"/hero-*.mp4 "$IMG/hero-poster.jpg" | awk '{print "  " $5, $9}'
  echo
  echo "Agora troque o poster em index.html:"
  echo '  poster="assets/img/hero-poster.jpg"'
}

case "${1:-}" in
  contatos) contatos ;;
  corta)    corta "${2:?arquivo}" "${3:-0}" "${4:-10}" ;;
  *) sed -n '2,12p' "$0" ;;
esac
