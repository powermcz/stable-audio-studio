"""Audio processing service — trim, fade, normalize, format conversion."""

import base64
import io
import numpy as np
import soundfile as sf
from typing import List


def decode_audio(audio_base64: str) -> tuple[np.ndarray, int]:
    """Decode base64 audio to numpy array and sample rate."""
    audio_bytes = base64.b64decode(audio_base64)
    data, sr = sf.read(io.BytesIO(audio_bytes))
    return data, sr


def encode_audio(data: np.ndarray, sample_rate: int, fmt: str = "wav") -> str:
    """Encode numpy audio array to base64 string."""
    buffer = io.BytesIO()
    # PCM_16 for WAV — Chromium's <audio> element cannot play float32 WAV
    subtype = "PCM_16" if fmt == "wav" else None
    sf.write(buffer, data, sample_rate, format=fmt, subtype=subtype)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def convert_format(audio_base64: str, target_format: str, sample_rate: int) -> bytes:
    """Convert audio to the target format, returning raw bytes."""
    data, sr = decode_audio(audio_base64)
    buffer = io.BytesIO()

    if target_format == "mp3":
        # Use pydub for mp3 conversion
        from pydub import AudioSegment

        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, data, sr, format="wav")
        wav_buffer.seek(0)
        segment = AudioSegment.from_wav(wav_buffer)
        segment.export(buffer, format="mp3")
    else:
        sf.write(buffer, data, sr, format=target_format)

    buffer.seek(0)
    return buffer.read()


def process_audio(
    audio_base64: str, operations: List[dict], sample_rate: int
) -> tuple[str, int, float]:
    """Apply a sequence of audio processing operations."""
    data, sr = decode_audio(audio_base64)

    for op in operations:
        op_type = op.get("type")
        params = op.get("params", {})

        if op_type == "trim":
            start = int(params.get("start", 0) * sr)
            end = int(params.get("end", len(data) / sr) * sr)
            data = data[start:end]

        elif op_type == "fade_in":
            duration_samples = int(params.get("duration", 0.5) * sr)
            if duration_samples > 0 and duration_samples <= len(data):
                fade = np.linspace(0, 1, duration_samples)
                if data.ndim == 2:
                    fade = fade[:, np.newaxis]
                data[:duration_samples] *= fade

        elif op_type == "fade_out":
            duration_samples = int(params.get("duration", 0.5) * sr)
            if duration_samples > 0 and duration_samples <= len(data):
                fade = np.linspace(1, 0, duration_samples)
                if data.ndim == 2:
                    fade = fade[:, np.newaxis]
                data[-duration_samples:] *= fade

        elif op_type == "normalize":
            peak = np.max(np.abs(data))
            if peak > 0:
                data = data / peak

        elif op_type == "gain":
            gain_db = params.get("gain_db", 0)
            data = data * (10 ** (gain_db / 20))
            data = np.clip(data, -1.0, 1.0)

    encoded = encode_audio(data, sr)
    duration = len(data) / sr
    return encoded, sr, duration
