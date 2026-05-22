"""
FastAPI Development Server Startup Script

Starts the FastAPI application with automatic reloading for development.
Usage: python scripts/run_server.py
"""

import subprocess
import sys
import os
from pathlib import Path

# Change to backend directory
backend_dir = Path(__file__).parent.parent
os.chdir(backend_dir)

print("=" * 60)
print("Starting FastAPI Development Server")
print("=" * 60)
print(f"Working directory: {backend_dir}")
print(f"Python version: {sys.version}")
print("\nConfiguration:")
print("   - Host: 0.0.0.0")
print("   - Port: 8000")
print("   - Reload: Enabled")
print("   - Docs: http://localhost:8000/api/docs")
print("   - OpenAPI JSON: http://localhost:8000/api/openapi.json")
print("\n" + "=" * 60)
print("\n")

# Run uvicorn
try:
    subprocess.run([
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload",
        "--log-level", "info"
    ])
except KeyboardInterrupt:
    print("\n\n" + "=" * 60)
    print("Server stopped by user")
    print("=" * 60)
except Exception as e:
    print(f"\nError: {e}")
    sys.exit(1)
