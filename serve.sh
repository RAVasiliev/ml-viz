#!/usr/bin/env bash
# Локальный статический сервер для ML-виз.
cd "$(dirname "$0")" || exit 1
PORT="${1:-8000}"
echo "ML-виз → http://localhost:${PORT}"
exec python3 -m http.server "${PORT}"
