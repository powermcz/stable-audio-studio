"""Pydantic models for API request/response schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    negative_prompt: Optional[str] = Field(None, max_length=1000, alias="negativePrompt")
    duration: float = Field(10.0, ge=1.0, le=47.0)
    steps: int = Field(100, ge=10, le=300)
    cfg_scale: float = Field(7.0, ge=1.0, le=20.0, alias="cfgScale")
    seed: Optional[int] = Field(None, ge=0)

    model_config = {"populate_by_name": True}


class GenerateResponse(BaseModel):
    audio_base64: str
    sample_rate: int
    duration: float


class ModelStatusResponse(BaseModel):
    loaded: bool
    loading: bool
    device: str
    model_name: str
    error: Optional[str] = None
    model_cached: bool = False
    generating: bool = False
    generation_progress: int = 0
    generation_total: int = 0


class AudioConvertRequest(BaseModel):
    audio_base64: str
    target_format: str = Field(..., pattern=r"^(wav|flac|mp3|ogg)$")
    sample_rate: int = 44100


class AudioProcessRequest(BaseModel):
    audio_base64: str
    operations: list[dict]
    sample_rate: int = 44100


class AudioProcessResponse(BaseModel):
    audio_base64: str
    sample_rate: int
    duration: float
