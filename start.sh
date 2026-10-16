#!/usr/bin/env bash
# Starts the two MCP servers + the agent (host) with its web UI. Ctrl+C stops everything.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
[ -f .env ] || { echo "Missing .env (copy .env.example and set OPENAI_API_KEY)"; exit 1; }

PY=.venv/bin/python
pids=()
trap 'kill "${pids[@]}" 2>/dev/null; exit 0' INT TERM

$PY -m servers.garden & pids+=($!)
$PY -m servers.weather & pids+=($!)
sleep 3  # the host discovers the servers on startup
$PY -m host & pids+=($!)

wait
