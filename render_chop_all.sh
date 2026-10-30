#!/usr/bin/env bash
# Render chop animation with axe for hero and worker_new in parallel, then re-pack.
set -e
BLENDER="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
SCRIPT="$(dirname "$0")/render_chop_with_axe.py"

echo "=== Rendering chop+axe for hero ==="
"$BLENDER" --background --python "$SCRIPT" -- --character hero \
  > /tmp/chop_hero.log 2>&1 &
PID_HERO=$!

echo "=== Rendering chop+axe for worker_new ==="
"$BLENDER" --background --python "$SCRIPT" -- --character worker_new \
  > /tmp/chop_worker.log 2>&1 &
PID_WORKER=$!

echo "Waiting for both renders (PIDs: $PID_HERO, $PID_WORKER) …"
wait $PID_HERO
echo "hero chop done (exit $?)"
wait $PID_WORKER
echo "worker_new chop done (exit $?)"

echo ""
echo "=== Packing chop sprite sheets ==="
cd "$(dirname "$0")"
python pack_sprites.py --character all

echo ""
echo "All done."
