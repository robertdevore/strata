#!/usr/bin/env python3
"""
Drafts → Strata Migration Script

Reads all drafts from the Drafts app's SQLite database and imports them
into Strata via the local HTTP API (http://127.0.0.1:3939).

Preserves: tags, starred/flagged status, archived/hidden status, timestamps.

Usage:
    python3 scripts/migrate-drafts-to-strata.py

Requirements:
    - Strata must be running (API on port 3939)
    - Python 3 (stdlib only — no extra packages)
"""

import sqlite3
import json
import urllib.request
import urllib.error
import sys
import time
import os

# ---- Config ----
DRAFTS_DB = os.path.expanduser(
    "~/Library/Group Containers/GTFQ98J4YG.com.agiletortoise.Drafts/DraftStore.sqlite"
)
STRATA_API = os.environ.get("STRATA_API_BASE_URL", "http://127.0.0.1:3939")
STRATA_TOKEN = os.environ.get("STRATA_API_TOKEN", "")
BATCH_DELAY = float(os.environ.get("BATCH_DELAY", "0.1"))  # seconds between API calls
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"
SKIP = int(os.environ.get("SKIP", "0"))  # skip first N drafts (for resume)

# Core Data epoch offset (seconds between 1970-01-01 and 2001-01-01)
CD_EPOCH_OFFSET = 978307200


def cd_timestamp_to_iso(cd_ts):
    """Convert Core Data timestamp (seconds since 2001-01-01) to ISO 8601."""
    if cd_ts is None or cd_ts == 0:
        return None
    unix_ts = cd_ts + CD_EPOCH_OFFSET
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(unix_ts))


def parse_cached_tags(raw):
    """Parse ZZZ-delimited cached tags into a clean list."""
    if not raw:
        return []
    # Tags are delimited by ZZZ; there may be spaces between adjacent ZZZ blocks.
    # Example: "ZZZwpdZZZ ZZZsecurityZZZ" → ["wpd", "security"]
    # Strategy: replace "ZZZ ZZZ" with "ZZZ" first to collapse gaps,
    # then split on "ZZZ" and filter empties.
    collapsed = raw.replace("ZZZ ZZZ", "ZZZ").replace("ZZZ ZZZ", "ZZZ")
    tags = [t.strip() for t in collapsed.split("ZZZ") if t.strip()]
    # Filter out numeric-only tags (sometimes Core Data FKs leak in)
    return [t for t in tags if not t.isdigit()]


def api_request(method, path, body=None, retries=3):
    """Make an HTTP request to the Strata API with retry logic."""
    url = f"{STRATA_API}{path}"
    data = None
    headers = {}

    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    if STRATA_TOKEN:
        headers["X-Strata-Token"] = STRATA_TOKEN

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt < retries - 1:
                wait = (attempt + 1) * 2
                time.sleep(wait)
                continue
            if isinstance(e, urllib.error.HTTPError):
                body_text = e.read().decode("utf-8", errors="replace")
                print(f"  HTTP {e.code}: {body_text[:200]}", file=sys.stderr)
            else:
                print(f"  Connection error: {e}", file=sys.stderr)
            return None
    return None


def build_content(title, body):
    """Build Markdown content from title and body."""
    if title and body:
        return f"# {title}\n\n{body}"
    elif title:
        return f"# {title}\n\n"
    elif body:
        return body
    return "# Untitled\n\n"


def main():
    # Verify Strata is running
    health = api_request("GET", "/health")
    if not health or not health.get("ok"):
        print("ERROR: Strata API is not reachable. Is Strata running?", file=sys.stderr)
        print(f"  Tried: {STRATA_API}/health", file=sys.stderr)
        sys.exit(1)

    print("✅ Strata API is reachable")

    # Connect to Drafts database
    if not os.path.exists(DRAFTS_DB):
        print(f"ERROR: Drafts database not found at: {DRAFTS_DB}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(f"file:{DRAFTS_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    # Get all drafts (excluding hidden unless requested)
    include_hidden = os.environ.get("INCLUDE_HIDDEN", "") == "1"
    where = "" if include_hidden else "WHERE ZHIDDEN = 0"

    rows = conn.execute(
        f"SELECT Z_PK, ZTITLE, ZCONTENT, ZCREATED_AT, ZMODIFIED_AT, "
        f"ZFLAGGED, ZHIDDEN, ZCACHED_TAGS, ZUUID "
        f"FROM ZMANAGEDDRAFT {where} "
        f"ORDER BY ZCREATED_AT ASC"
    ).fetchall()

    total = len(rows)
    if SKIP > 0:
        print(f"⏭  Skipping first {SKIP} drafts (resume mode)")
        rows = rows[SKIP:]
        total = len(rows)
    print(f"📋 Importing {total} drafts" + (" (excluding hidden)" if not include_hidden else " (including hidden)"))

    if DRY_RUN:
        print("🔍 DRY RUN — no notes will be created")
        for i, row in enumerate(rows[:10]):
            tags = parse_cached_tags(row["ZCACHED_TAGS"])
            created = cd_timestamp_to_iso(row["ZCREATED_AT"])
            title = row["ZTITLE"] or ""
            print(f"  [{i+1}] {title[:60]} | tags={tags} | flagged={row['ZFLAGGED']} | created={created}")
        print(f"  ... and {total - 10} more")
        conn.close()
        return

    imported = 0
    skipped = 0
    errors = 0

    for i, row in enumerate(rows):
        tags = parse_cached_tags(row["ZCACHED_TAGS"])
        created_at = cd_timestamp_to_iso(row["ZCREATED_AT"])
        modified_at = cd_timestamp_to_iso(row["ZMODIFIED_AT"])
        title = (row["ZTITLE"] or "").strip()
        body = (row["ZCONTENT"] or "").strip()
        content = build_content(title, body)

        payload = {
            "content": content,
            "starred": bool(row["ZFLAGGED"]),
            "archived": bool(row["ZHIDDEN"]),
            "tags": tags,
        }

        result = api_request("POST", "/notes", payload)
        if result and "note" in result:
            imported += 1
            note_id = result["note"]["id"]
            # Print progress every 50 notes or on the last one
            if (i + 1) % 50 == 0 or (i + 1) == total:
                title_preview = (title or "Untitled")[:50]
                print(f"  [{i+1}/{total}] {title_preview} → {note_id}")
        else:
            errors += 1
            print(f"  [{i+1}/{total}] FAILED: {(title or 'Untitled')[:50]}", file=sys.stderr)
            if errors > 20:
                print("  Too many errors, aborting.", file=sys.stderr)
                break

        time.sleep(BATCH_DELAY)

    conn.close()

    print(f"\n--- Migration complete ---")
    print(f"  Imported: {imported}")
    print(f"  Errors:   {errors}")
    print(f"  Total:    {total}")


if __name__ == "__main__":
    main()
