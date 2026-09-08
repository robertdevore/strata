#!/usr/bin/env python3
"""Administrative, consistent SQLite backup without provider credentials."""
import datetime
import json
import os
from pathlib import Path
import sqlite3
import sys


def backup(source: Path, root: Path) -> Path:
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    destination = root / stamp
    destination.mkdir(parents=True, mode=0o700)
    target = destination / 'strata.sqlite'
    try:
        with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as original:
            with sqlite3.connect(target) as copied:
                original.backup(copied)
                copied.execute('PRAGMA secure_delete=ON')
                copied.execute("DELETE FROM settings WHERE lower(key) LIKE '%apikey%' OR key='apiToken'")
                copied.commit()
                copied.execute('VACUUM')
                if copied.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise RuntimeError('Backup integrity check failed')
                schema = copied.execute('PRAGMA user_version').fetchone()[0]
        target.chmod(0o600)
        (destination / 'manifest.json').write_text(json.dumps({
            'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'schemaVersion': schema, 'integrity': 'ok', 'providerSecrets': False,
        }) + '\n')
        return destination
    except BaseException:
        for file in destination.iterdir():
            file.unlink()
        destination.rmdir()
        raise


def main() -> None:
    default = (Path.home() / 'Library/Application Support/Strata' if sys.platform == 'darwin'
               else Path(os.environ.get('APPDATA', Path.home() / 'AppData/Roaming')) / 'Strata' if sys.platform == 'win32'
               else Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'Strata')
    configured = Path(os.environ.get('STRATA_USER_DATA_DIR', default))
    source = configured / 'data/strata.sqlite'
    if not source.exists() and (configured / 'strata.sqlite').exists():
        source = configured / 'strata.sqlite'
    if not source.exists():
        raise SystemExit('Strata database not found. Set STRATA_USER_DATA_DIR to the application data directory.')
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'StrataBackups'
    print(f'Backup verified: {backup(source, root)}')


if __name__ == '__main__':
    main()
