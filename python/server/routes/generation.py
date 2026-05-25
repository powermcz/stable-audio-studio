"""Audio generation route — text-to-audio via Stable Audio Open (diffusers)."""

import asyncio
import base64
import io
import torch
import soundfile as sf
from fastapi import APIRouter, HTTPException, Request

from ..models import GenerateRequest, GenerateResponse

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate_audio(request: Request, body: GenerateRequest):
    """Generate audio from a text prompt using Stable Audio Open 1.0."""
    model_service = request.app.state.model_service

    try:
        model_service.ensure_loaded()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not available: {e}")

    pipe = model_service.pipe
    sample_rate = model_service.sample_rate

    def _run_pipeline():
        """Blocking pipeline call — runs in a thread so uvicorn stays responsive."""
        generator = None
        if body.seed is not None:
            generator = torch.Generator(model_service.device).manual_seed(body.seed)

        model_service._is_generating = True
        model_service._generation_progress = 0
        model_service._generation_total = body.steps

        def progress_callback(step, timestep, latents):
            model_service._generation_progress = step + 1

        result = pipe(
            body.prompt,
            negative_prompt=body.negative_prompt or "Low quality.",
            num_inference_steps=body.steps,
            audio_end_in_s=body.duration,
            num_waveforms_per_prompt=1,
            generator=generator,
            callback=progress_callback,
            callback_steps=1,
        )

        model_service._is_generating = False
        return result

    try:
        # Run in a thread so the event loop can still serve /api/model/status
        result = await asyncio.to_thread(_run_pipeline)

        audio = result.audios[0].T.float().cpu().numpy()

        # Write as PCM 16-bit WAV — Chromium's <audio> element cannot play float32 WAV
        buffer = io.BytesIO()
        sf.write(buffer, audio, sample_rate, format="wav", subtype="PCM_16")
        buffer.seek(0)
        audio_base64 = base64.b64encode(buffer.read()).decode("utf-8")

        actual_duration = len(audio) / sample_rate

        return GenerateResponse(
            audio_base64=audio_base64,
            sample_rate=sample_rate,
            duration=actual_duration,
        )

    except Exception as e:
        model_service._is_generating = False
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")
