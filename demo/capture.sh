#!/usr/bin/env bash
# Record one demo shot to public/captures/<shot-id>.mp4.
#
# Usage:  ./capture.sh 03-consent-screen [seconds]
#
# Records the full screen with macOS screencapture. Stop early with
# Ctrl-C — the recording up to that point is kept. The .mov is remuxed
# to .mp4 (H.264, 30fps) for the Remotion composition.
#
# Consent-flow shots (02, 03, 07) must be ONE continuous take. If a
# take goes wrong, delete the file and record again — never trim inside
# the clip.
set -euo pipefail

SHOT="${1:?usage: ./capture.sh <shot-id> [max-seconds]}"
MAX="${2:-120}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$DIR/public/captures"
MOV="$OUT_DIR/$SHOT.mov"
MP4="$OUT_DIR/$SHOT.mp4"

mkdir -p "$OUT_DIR"
if [ -e "$MP4" ]; then
  echo "!! $MP4 exists. Delete it first to re-record."
  exit 1
fi

echo "Recording shot $SHOT for up to ${MAX}s. Ctrl-C to stop early."
for i in 3 2 1; do echo "  starting in $i..."; sleep 1; done

# Ctrl-C stops screencapture; keep what was written.
trap ':' INT
screencapture -v -V "$MAX" "$MOV" || true
trap - INT

if [ ! -s "$MOV" ]; then
  echo "!! No recording was written."
  exit 1
fi

ffmpeg -hide_banner -loglevel error -i "$MOV" \
  -c:v libx264 -preset slow -crf 18 -r 30 -pix_fmt yuv420p -an "$MP4"
rm -f "$MOV"

DUR=$(ffmpeg -i "$MP4" 2>&1 | sed -n 's/.*Duration: \([0-9:.]*\).*/\1/p')
echo "Wrote $MP4 (duration $DUR)."
echo "Next: in src/shots.ts set hasCapture: true and durationInFrames"
echo "for $SHOT to match the duration."
