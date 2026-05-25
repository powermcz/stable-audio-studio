"""
End-to-end test for the Stable Audio Studio Python backend.

Runs against the REAL model (no mocks). Requires:
  - CUDA GPU with 8GB+ VRAM  (or slow CPU fallback)
  - Model already cached or HuggingFace auth configured
  - Python venv with all deps installed

Usage:
  cd python
  venv/Scripts/python -m pytest tests/test_e2e_generation.py -v -s
"""

import base64
import io
import os
import time

import pytest
import soundfile as sf
import numpy as np


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def backend():
    """Start the FastAPI backend in a background thread and return its base URL."""
    import threading
    import uvicorn

    # Import the app AFTER setting up the path
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from server.main import app

    host, port = "127.0.0.1", 18765  # non-default port to avoid conflicts
    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Wait for readiness
    import httpx
    base = f"http://{host}:{port}"
    for _ in range(120):  # up to 120s for model load
        try:
            r = httpx.get(f"{base}/api/health", timeout=2)
            if r.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        pytest.fail("Backend did not start within 120 seconds")

    yield base

    server.should_exit = True


@pytest.fixture(scope="session")
def http():
    import httpx
    return httpx.Client(timeout=300)  # generous timeout for generation


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestHealthAndModel:
    def test_health(self, backend, http):
        r = http.get(f"{backend}/api/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"

    def test_model_status_before_load(self, backend, http):
        r = http.get(f"{backend}/api/model/status")
        assert r.status_code == 200
        data = r.json()
        assert "loaded" in data
        assert "device" in data

    def test_load_model(self, backend, http):
        r = http.post(f"{backend}/api/model/load")
        assert r.status_code == 200
        data = r.json()
        assert data["loaded"] is True
        assert data["device"] in ("cuda", "mps", "cpu")

    def test_model_status_after_load(self, backend, http):
        r = http.get(f"{backend}/api/model/status")
        assert r.status_code == 200
        data = r.json()
        assert data["loaded"] is True


class TestAudioGeneration:
    """Test real audio generation with the Stable Audio Open 1.0 model."""

    def test_generate_short_audio(self, backend, http):
        """Generate a short 3-second clip — verifies the full pipeline."""
        payload = {
            "prompt": "a short drum hit",
            "duration": 3.0,
            "steps": 20,       # low step count for speed
            "cfgScale": 5.0,
            "seed": 42,
        }
        r = http.post(f"{backend}/api/generate", json=payload)
        assert r.status_code == 200, f"Generation failed: {r.text}"

        data = r.json()
        assert "audio_base64" in data
        assert data["sample_rate"] == 44100
        assert data["duration"] > 0

        # Decode and validate it's a real WAV
        wav_bytes = base64.b64decode(data["audio_base64"])
        assert len(wav_bytes) > 1000, "WAV file too small"
        assert wav_bytes[:4] == b"RIFF", "Not a valid RIFF/WAV"
        assert wav_bytes[8:12] == b"WAVE", "Not a valid WAV"

        # Parse with soundfile and check it has actual audio content
        audio_data, sr = sf.read(io.BytesIO(wav_bytes))
        assert sr == 44100
        assert len(audio_data) > 0
        # It should not be silent (all zeros)
        assert np.max(np.abs(audio_data)) > 0.001, "Audio is silent — generation may have failed"

        print(f"  ✓ Generated {data['duration']:.1f}s audio, "
              f"shape={audio_data.shape}, peak={np.max(np.abs(audio_data)):.4f}")

    def test_generate_with_negative_prompt(self, backend, http):
        payload = {
            "prompt": "ambient pad with reverb",
            "negativePrompt": "Low quality, noise, distortion",
            "duration": 3.0,
            "steps": 20,
            "cfgScale": 7.0,
            "seed": 123,
        }
        r = http.post(f"{backend}/api/generate", json=payload)
        assert r.status_code == 200, f"Generation failed: {r.text}"

        data = r.json()
        wav_bytes = base64.b64decode(data["audio_base64"])
        audio_data, sr = sf.read(io.BytesIO(wav_bytes))
        assert sr == 44100
        assert np.max(np.abs(audio_data)) > 0.001

        print(f"  ✓ Generated with negative prompt, peak={np.max(np.abs(audio_data)):.4f}")

    def test_deterministic_seed(self, backend, http):
        """Same seed + prompt should produce identical audio."""
        payload = {
            "prompt": "a single bell ring",
            "duration": 2.0,
            "steps": 15,
            "cfgScale": 5.0,
            "seed": 999,
        }
        r1 = http.post(f"{backend}/api/generate", json=payload)
        r2 = http.post(f"{backend}/api/generate", json=payload)

        assert r1.status_code == 200
        assert r2.status_code == 200

        assert r1.json()["audio_base64"] == r2.json()["audio_base64"], \
            "Same seed should produce identical output"

        print("  ✓ Deterministic seed produces identical output")


class TestAudioProcessing:
    """Test audio processing endpoints with real WAV data."""

    @pytest.fixture()
    def sample_audio_b64(self, backend, http):
        """Generate a short sample to use for processing tests."""
        payload = {
            "prompt": "a click sound",
            "duration": 2.0,
            "steps": 10,
            "cfgScale": 5.0,
            "seed": 77,
        }
        r = http.post(f"{backend}/api/generate", json=payload)
        assert r.status_code == 200
        return r.json()["audio_base64"]

    def test_normalize(self, backend, http, sample_audio_b64):
        payload = {
            "audio_base64": sample_audio_b64,
            "operations": [{"type": "normalize", "params": {}}],
            "sample_rate": 44100,
        }
        r = http.post(f"{backend}/api/audio/process", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert "audio_base64" in data

        audio, sr = sf.read(io.BytesIO(base64.b64decode(data["audio_base64"])))
        peak = np.max(np.abs(audio))
        assert 0.95 < peak <= 1.0, f"Normalized peak should be ~1.0, got {peak}"
        print(f"  ✓ Normalize: peak={peak:.4f}")

    def test_trim(self, backend, http, sample_audio_b64):
        payload = {
            "audio_base64": sample_audio_b64,
            "operations": [{"type": "trim", "params": {"start": 0.0, "end": 1.0}}],
            "sample_rate": 44100,
        }
        r = http.post(f"{backend}/api/audio/process", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert 0.9 < data["duration"] < 1.1, f"Expected ~1s, got {data['duration']:.2f}s"
        print(f"  ✓ Trim: duration={data['duration']:.2f}s")

    def test_gain(self, backend, http, sample_audio_b64):
        payload = {
            "audio_base64": sample_audio_b64,
            "operations": [{"type": "gain", "params": {"gain_db": -6}}],
            "sample_rate": 44100,
        }
        r = http.post(f"{backend}/api/audio/process", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert "audio_base64" in data
        print("  ✓ Gain: -6dB applied")

    def test_convert_to_flac(self, backend, http, sample_audio_b64):
        payload = {
            "audio_base64": sample_audio_b64,
            "target_format": "flac",
            "sample_rate": 44100,
        }
        r = http.post(f"{backend}/api/audio/convert", json=payload)
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/flac"
        assert len(r.content) > 100
        print(f"  ✓ FLAC conversion: {len(r.content)} bytes")
