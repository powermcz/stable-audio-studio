"""Model management routes."""

from fastapi import APIRouter, HTTPException, Request

from ..models import ModelStatusResponse

router = APIRouter()


@router.get("/model/status", response_model=ModelStatusResponse)
async def model_status(request: Request):
    """Get current model status."""
    service = request.app.state.model_service
    return service.get_status()


@router.post("/model/load", response_model=ModelStatusResponse)
async def load_model(request: Request):
    """Explicitly load the model into memory."""
    service = request.app.state.model_service
    try:
        service.load()
        return service.get_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")


@router.get("/model/auth")
async def check_auth(request: Request):
    """Check HuggingFace authentication and model access."""
    service = request.app.state.model_service
    return service.check_hf_auth()
