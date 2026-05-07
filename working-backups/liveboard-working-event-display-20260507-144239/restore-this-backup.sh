#!/bin/bash
set -e

PROJECT_DIR="/Users/danielmyrick/live-board"
BACKUP_DIR="/Users/danielmyrick/live-board/working-backups/liveboard-working-event-display-20260507-144239"

echo "Restoring liveboard from:"
echo "$BACKUP_DIR"
echo ""

cp -R "$BACKUP_DIR/src" "$PROJECT_DIR/"
cp -R "$BACKUP_DIR/public" "$PROJECT_DIR/"

if [ -f "$BACKUP_DIR/package.json" ]; then
  cp "$BACKUP_DIR/package.json" "$PROJECT_DIR/package.json"
fi

if [ -f "$BACKUP_DIR/package-lock.json" ]; then
  cp "$BACKUP_DIR/package-lock.json" "$PROJECT_DIR/package-lock.json"
fi

if [ -f "$BACKUP_DIR/vite.config.js" ]; then
  cp "$BACKUP_DIR/vite.config.js" "$PROJECT_DIR/vite.config.js"
fi

if [ -f "$BACKUP_DIR/index.html" ]; then
  cp "$BACKUP_DIR/index.html" "$PROJECT_DIR/index.html"
fi

echo "Restore complete."
echo "Now run:"
echo "cd '$PROJECT_DIR' && npm run build"
