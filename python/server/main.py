"""FastAPI application for Stable Audio Studio backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.generation import router as generation_router
from .routes.audio import router as audio_router
from .routes.model import router as model_router
from .services.model_service import ModelService

app = FastAPI(
    title="Stable Audio Studio Backend",
    version="0.1.0",
    docs_url="/api/docs",
)

# CORS — only allow local Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:*", "file://"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared model service instance
model_service = ModelService()
app.state.model_service = model_service

# Register routes
app.include_router(generation_router, prefix="/api")
app.include_router(audio_router, prefix="/api")
app.include_router(model_router, prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}


@app.on_event("startup")
async def startup_event():
    """Optionally pre-load model on startup."""
    pass  # Model loaded on first generation or explicit load request
