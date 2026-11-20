"""API FastAPI de génération de partitions Partitio (propulsée par music21).

Exposée sur Render :
  - GET  /api/health   : vérification de l'état du service et de la version de music21
  - POST /api/generate : génère une partition JSON compatible avec le front-end VexFlow
  - GET  /*            : sert les fichiers statiques du front-end (dossier docs/)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import music21
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .generator import generate_score

ROOT_DIR = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT_DIR / "docs"

app = FastAPI(
    title="Partitio Music21 API",
    description="API Python basée sur music21 pour la génération de partitions de piano Partitio.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_frontend_assets(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.endswith((".js", ".css", ".html")):
        response.headers["Cache-Control"] = "no-cache"
    return response


class GenerateRequest(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)
    seed: int | None = None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "engine": "music21",
        "music21_version": getattr(music21, "__version__", "unknown"),
    }


@app.post("/api/generate")
def api_generate(req: GenerateRequest) -> dict[str, Any]:
    return generate_score(req.settings, req.seed)


# Sert le front-end statique identique à l'existant depuis docs/ (après les routes /api/*)
if DOCS_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(DOCS_DIR), html=True), name="frontend")
