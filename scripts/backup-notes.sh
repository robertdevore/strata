#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${STRATA_USER_DATA_DIR:-$HOME/Library/Application Support/Strata/data}"
TARGET_ROOT="${1:-$HOME/StrataBackups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="$TARGET_ROOT/$TIMESTAMP"

if [[ ! -d "$SOURCE_DIR" ]]; then
	echo "Strata data directory not found: $SOURCE_DIR"
	echo "Set STRATA_USER_DATA_DIR to your app.getPath('userData')/data path if different."
	exit 1
fi

if [[ ! -f "$SOURCE_DIR/strata.sqlite" ]]; then
	echo "No database found at: $SOURCE_DIR/strata.sqlite"
	echo "Open Strata and create/save at least one note first."
	exit 1
fi

mkdir -p "$TARGET_DIR"

cp "$SOURCE_DIR/strata.sqlite" "$TARGET_DIR/"

if [[ -f "$SOURCE_DIR/strata.sqlite-wal" ]]; then
	cp "$SOURCE_DIR/strata.sqlite-wal" "$TARGET_DIR/"
fi

if [[ -f "$SOURCE_DIR/strata.sqlite-shm" ]]; then
	cp "$SOURCE_DIR/strata.sqlite-shm" "$TARGET_DIR/"
fi

cat > "$TARGET_DIR/README.txt" <<EOF
Strata backup created: $(date)
Source: $SOURCE_DIR

Files in this backup:
- strata.sqlite
- strata.sqlite-wal (if present)
- strata.sqlite-shm (if present)
EOF

echo "Backup completed: $TARGET_DIR"
