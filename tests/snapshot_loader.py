from pathlib import Path
import gzip, json
ROOT = Path(__file__).resolve().parents[1]
def snapshot_path():
    plain=ROOT/'database/db.json'; zipped=ROOT/'database/db.json.gz'
    if plain.exists(): return plain
    if zipped.exists(): return zipped
    raise FileNotFoundError('database/db.json or database/db.json.gz not found')
def load_snapshot():
    p=snapshot_path()
    if p.suffix=='.gz':
        with gzip.open(p,'rt',encoding='utf-8') as f: return json.load(f)
    return json.loads(p.read_text(encoding='utf-8'))

def snapshot_available():
    """True when the private legacy snapshot is present in this checkout."""
    try:
        snapshot_path()
        return True
    except FileNotFoundError:
        return False

def print_snapshot_skip(suite, skipped):
    """Say out loud what was not verified, and how to verify it.

    The legacy snapshot carries real people's records, so it is kept out of the
    repository on purpose and is therefore absent in CI. A run without it is a
    partial run; announcing that is the difference between a skipped check and
    a check that quietly looked like a pass.
    """
    print(f'[SKIP] {suite}: database/db.json(.gz) is absent — it is private legacy data and is never committed.')
    print(f'[SKIP] not verified in this run: {skipped}')
    print('[SKIP] to verify locally, place the snapshot at database/db.json.gz and re-run this suite.')
