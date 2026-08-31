#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FacilityOps Energy Intelligence Platform — One-Command Startup
# Phases 1–4: DB setup → Dataset seed → AI training → API server → Browser
# ─────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  🏭 FacilityOps Energy Intelligence Platform"
echo "  Agentic AI — Phase 1–4 Startup"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Python check ─────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3 not found. Please install Python 3.9+ and try again."
  exit 1
fi
PYTHON=$(command -v python3)
echo "✅ Python: $($PYTHON --version)"

# ── Step 2: Virtual environment ──────────────────────────────────────────────
VENV_DIR="$BACKEND_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
  echo "📦 Creating virtual environment…"
  $PYTHON -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
echo "✅ Virtual environment active"

# ── Step 3: Install dependencies ─────────────────────────────────────────────
echo ""
echo "📦 Installing Python dependencies…"
pip install -q --upgrade pip
pip install -q -r "$BACKEND_DIR/requirements.txt"
echo "✅ Dependencies installed"

# ── Step 4: Phase 1 — Database setup & data seeding ─────────────────────────
echo ""
echo "── Phase 1: Database & Data Engine ────────────────────────"
cd "$BACKEND_DIR"
$PYTHON seed_data.py

# ── Step 5: Phase 2 — AI model training ─────────────────────────────────────
echo ""
echo "── Phase 2: AI Engine — Training Models ───────────────────"
$PYTHON ai_engine.py

echo ""
echo "── Verification ────────────────────────────────────────────"
$PYTHON -c "
import sys, os
sys.path.insert(0, '.')
from ai_engine import check_accuracy
result = check_accuracy()
print(result)
"

# ── Step 6: Kill anything on port 8000 ──────────────────────────────────────
if lsof -i :8000 &>/dev/null; then
  echo ""
  echo "⚠️  Port 8000 in use — stopping previous process…"
  lsof -ti :8000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ── Step 7: Phase 3 — Start FastAPI server ───────────────────────────────────
echo ""
echo "── Phase 3 & 4: Starting API Server + Dashboard ───────────"
echo ""
echo "  📡 API:       http://localhost:8000/api"
echo "  🖥️  Dashboard: http://localhost:8000"
echo "  📖 API Docs:  http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop"
echo "════════════════════════════════════════════════════════════"
echo ""

# Open browser after 2s
( sleep 2 && open "http://localhost:8000" ) &

# Start server
cd "$BACKEND_DIR"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
