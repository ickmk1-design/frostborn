#!/bin/bash
BLENDER="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
SCRIPT="C:/Users/ickmk/Frostborn/render_sprites.py"
LOG_BASE="C:/Users/ickmk/Frostborn/meshyout"

for CHAR in hero worker_new; do
  for ANIM in walk idle chop carry_walk cheer; do
    echo "=== $CHAR / $ANIM ==="
    "$BLENDER" --background --python "$SCRIPT" -- --anim "$ANIM" --character "$CHAR" --dirs 8
    echo "=== done $CHAR/$ANIM ==="
  done
done

echo "ALL DONE"
