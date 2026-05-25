"""Audio utility routes — conversion, processing."""

from fastapi import APIRouter, HTTPException, Response

from ..models import AudioConvertRequest, AudioProcessRequest, AudioProcessResponse
from ..services.audio_service import convert_format, process_audio

router = APIRouter()


@router.post("/audio/convert")
async def convert_audio(body: AudioConvertRequest):
    """Convert audio to a different format."""
    try:
        result_bytes = convert_format(
            body.audio_base64, body.target_format, body.sample_rate
        )
        media_type = {
            "wav": "audio/wav",
            "flac": "audio/flac",
            "mp3": "audio/mpeg",
            "ogg": "audio/ogg",
        }.get(body.target_format, "application/octet-stream")

        return Response(content=result_bytes, media_type=media_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {e}")


@router.post("/audio/process", response_model=AudioProcessResponse)
async def process_audio_route(body: AudioProcessRequest):
    """Apply audio processing operations (trim, fade, normalize, gain)."""
    try:
        audio_base64, sample_rate, duration = process_audio(
            body.audio_base64, body.operations, body.sample_rate
        )
        return AudioProcessResponse(
            audio_base64=audio_base64,
            sample_rate=sample_rate,
            duration=duration,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")
