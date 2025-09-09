#!/usr/bin/env bash
# Convenience wrapper to run MongoDB initialization

set -euo pipefail

DB_CONN_FILE="../db_connection.txt"
if [ ! -f "$DB_CONN_FILE" ]; then
  echo "db_connection.txt not found. Run ../startup.sh first or create the file with a mongosh connection string."
  exit 1
fi

CONN_STR=$(cat "$DB_CONN_FILE")
echo "Using connection: $CONN_STR"
mongosh "$CONN_STR" --file "$(dirname "$0")/init.js"
echo "Initialization completed."
