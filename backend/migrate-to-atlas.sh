#!/usr/bin/env bash
# One-time migration: copy all local MongoDB data into the Atlas production DB.
# Reads DATABASE_URL (Atlas) and LOCAL_DATABASE_URL from backend/.env.
set -euo pipefail

cd "$(dirname "$0")"

# Read values without sourcing — the URIs contain & and ? which break `source`.
read_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
LOCAL="$(read_env LOCAL_DATABASE_URL)"; LOCAL="${LOCAL:-mongodb://localhost:27017/zerodha}"
ATLAS="$(read_env DATABASE_URL)"
[[ -n "$ATLAS" ]] || { echo "DATABASE_URL not set in .env"; exit 1; }

if [[ "$ATLAS" == *"<db_password>"* ]]; then
  echo "✋ Replace <db_password> in backend/.env with the real password first."
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Dumping local data from $LOCAL"
mongodump --uri="$LOCAL" --out="$TMP" --quiet

DBDIR="$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | head -1)"
echo "→ Restoring into Atlas (non-destructive; existing docs with same _id are skipped)"
mongorestore --uri="$ATLAS" --nsInclude='*' --dir="$DBDIR" --quiet

echo "✓ Migration complete. Verifying Atlas collection counts:"
mongosh "$ATLAS" --quiet --eval '
  db.getCollectionNames().sort().forEach(c => print("  " + c + ": " + db[c].countDocuments()))'
