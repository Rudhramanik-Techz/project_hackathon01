#!/usr/bin/env bash
# Starts the local API (:8000) and the Vite dev server (:5173) together. Ctrl+C stops both.
# Works in Git Bash on Windows and in bash on macOS/Linux.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . <(tr -d '\r' < .env)
  set +a
fi

PY=.venv/Scripts/python.exe
[ -x "$PY" ] || PY=.venv/bin/python
if [ ! -x "$PY" ]; then
  echo "No .venv found. Run: py -3.12 -m venv .venv && .venv/Scripts/python -m pip install -r backend/requirements-dev.txt" >&2
  exit 1
fi
[ -d frontend/node_modules ] || (cd frontend && npm install)

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
for port in 8000 5173; do
  if port_busy "$port"; then
    echo "Port $port is already in use (an old dev server?). Stop it first:" >&2
    echo "  PowerShell: Get-NetTCPConnection -LocalPort $port -State Listen | % { Stop-Process -Id \$_.OwningProcess -Force }" >&2
    echo "  (on Windows a uvicorn --reload worker can outlive its parent; stop the python.exe child too)" >&2
    exit 1
  fi
done

cleanup() {
  kill "$API_PID" 2>/dev/null || true
  # On Windows the uvicorn reload worker is a separate process that survives the kill above.
  if command -v powershell.exe >/dev/null 2>&1; then
    # Only the process that owns :8000 and its children (the reload worker).
    powershell.exe -NoProfile -Command \
      "foreach (\$p in @((Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue).OwningProcess)) { Get-CimInstance Win32_Process -Filter \"ParentProcessId=\$p\" | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id \$p -Force -ErrorAction SilentlyContinue }" \
      >/dev/null 2>&1 || true
  fi
}

export PYTHONUTF8=1
"$PY" -m uvicorn --app-dir scripts local_api:app --host 127.0.0.1 --port 8000 \
  --reload --reload-dir backend --reload-dir scripts &
API_PID=$!
trap cleanup EXIT INT TERM

echo "API  -> http://127.0.0.1:8000/api/health"
echo "App  -> http://localhost:5173"
cd frontend && npm run dev
