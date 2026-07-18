#!/bin/sh
set -e
PORT="${NFC_PORT:-8080}"
exec gunicorn -w 1 --threads 8 -b "0.0.0.0:${PORT}" --timeout 120 wsgi:app
