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
