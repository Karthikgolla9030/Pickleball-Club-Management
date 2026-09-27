"""
Aught2 Pickleball — Local Development Server Launcher
Configures the Windows SelectorEventLoop for psycopg async compatibility and launches Uvicorn.
"""
from __future__ import annotations

import asyncio
import sys
import uvicorn
from uvicorn.loops import asyncio as uvicorn_asyncio

if sys.platform == "win32":
    # Psycopg on Windows requires SelectorEventLoop for async operations
    uvicorn_asyncio.asyncio_loop_factory = lambda use_subprocess=False: asyncio.SelectorEventLoop
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        loop="asyncio",
        reload=False,
        log_level="info",
    )
