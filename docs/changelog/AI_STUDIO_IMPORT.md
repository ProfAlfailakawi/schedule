# AI Studio import contract

This archive is a MERGE-SAFE workspace replacement.

- Do not delete existing files solely because an earlier compact deployment archive omitted them.
- `dist/` is intentionally preserved in this workspace for import parity, but Cloud Run source deployment excludes it through `.gcloudignore` and rebuilds it with `gcp-build`.
- `database/db.json` is intentionally preserved byte-for-byte for AI Studio workspace parity.
- `database/db.json.gz` is the compact Cloud Run bootstrap copy. `.gcloudignore` excludes the 15 MB plain JSON from Cloud Run source upload.
- Never upload `node_modules/`.
