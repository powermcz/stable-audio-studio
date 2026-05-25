"""Quick smoke test for the running backend (port 8765)."""
import base64
import io
import time

import httpx
import numpy as np
import soundfile as sf

base = "http://127.0.0.1:8765"
client = httpx.Client(timeout=300)

# 1) Health check
print("1) Health check...")
r = client.get(f"{base}/api/health")
assert r.status_code == 200
print(f"   OK: {r.json()}")

# 2) Load model
print("2) Loading model...")
t0 = time.time()
r = client.post(f"{base}/api/model/load")
assert r.status_code == 200
data = r.json()
print(f"   Loaded in {time.time()-t0:.1f}s  device={data['device']}  loaded={data['loaded']}")

# 3) Generate
print("3) Generating audio (3s, 20 steps)...")
t0 = time.time()
r = client.post(f"{base}/api/generate", json={
    "prompt": "a short drum hit",
    "duration": 3.0,
    "steps": 20,
    "cfgScale": 5.0,
    "seed": 42,
})
elapsed = time.time() - t0
assert r.status_code == 200, f"Generate failed: {r.text}"
gen = r.json()
print(f"   Generated in {elapsed:.1f}s  duration={gen['duration']:.1f}s  sr={gen['sample_rate']}")
print(f"   base64 length: {len(gen['audio_base64'])} chars")

# 4) Decode and verify WAV
wav_bytes = base64.b64decode(gen["audio_base64"])
assert wav_bytes[:4] == b"RIFF"
audio, sr = sf.read(io.BytesIO(wav_bytes))
peak = np.max(np.abs(audio))
print(f"   Decoded WAV: shape={audio.shape}, sr={sr}, peak={peak:.4f}")
assert sr == 44100
assert peak > 0.001, "Audio is silent"

# 5) Audio processing - normalize
print("4) Testing audio processing (normalize)...")
r = client.post(f"{base}/api/audio/process", json={
    "audio_base64": gen["audio_base64"],
    "operations": [{"type": "normalize", "params": {}}],
    "sample_rate": 44100,
})
assert r.status_code == 200
proc = r.json()
audio2, sr2 = sf.read(io.BytesIO(base64.b64decode(proc["audio_base64"])))
peak2 = np.max(np.abs(audio2))
print(f"   Normalized: peak={peak2:.4f} (was {peak:.4f})")
assert 0.95 < peak2 <= 1.0

# 6) Audio processing - trim
print("5) Testing audio processing (trim to 1s)...")
r = client.post(f"{base}/api/audio/process", json={
    "audio_base64": gen["audio_base64"],
    "operations": [{"type": "trim", "params": {"start": 0.0, "end": 1.0}}],
    "sample_rate": 44100,
})
assert r.status_code == 200
proc = r.json()
print(f"   Trimmed duration: {proc['duration']:.2f}s")
assert 0.9 < proc["duration"] < 1.1

# 7) Deterministic seed
print("6) Testing deterministic seed...")
r2 = client.post(f"{base}/api/generate", json={
    "prompt": "a short drum hit",
    "duration": 3.0,
    "steps": 20,
    "cfgScale": 5.0,
    "seed": 42,
})
assert r2.status_code == 200
assert r2.json()["audio_base64"] == gen["audio_base64"], "Seed not deterministic!"
print("   Same seed → identical output ✓")

# Save to disk for manual inspection
sf.write("test_backend_output.wav", audio, sr)
print(f"\nSaved test_backend_output.wav")
print("\n=== ALL BACKEND TESTS PASSED ===")
