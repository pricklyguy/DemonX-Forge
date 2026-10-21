#!/bin/sh
# Starts DemonX Forge and opens it in your browser. Close this window (or press Ctrl+C) to stop Forge.
#   ./start-forge.sh             start and open the browser
#   ./start-forge.sh nobrowser   start without opening the browser (used by "start at login")
# launcher.mjs starts the version named in current.txt, and again after an update.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
PORT="${FORGE_PORT:-8120}"
export FORGE_PORT="$PORT"

# started with no window (at login): keep what Forge says in a file instead
if [ ! -t 1 ]; then
  mkdir -p data
  exec >>data/forge.log 2>&1
fi

if [ "$1" != "nobrowser" ]; then
  ( sleep 4; xdg-open "http://127.0.0.1:$PORT" >/dev/null 2>&1 || true ) &
fi

echo "Starting DemonX Forge on http://127.0.0.1:$PORT"
echo "Leave this window open: closing it stops Forge."
exec ./node/node ./launcher.mjs forge
