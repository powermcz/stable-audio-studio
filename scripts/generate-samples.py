"""Generate showcase audio samples for the README."""
import base64, io, os, time, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.chdir(os.path.join(os.path.dirname(__file__), ".."))

import torch
import soundfile as sf
from diffusers import StableAudioPipeline

OUT = "assets/samples"
os.makedirs(OUT, exist_ok=True)

SAMPLES = [
    ("drum-loop", "128 BPM tech house drum loop, punchy kick, crispy hi-hats", 10, 50),
    ("piano-ambient", "Ambient piano melody in C minor with reverb and delay", 10, 50),
    ("thunder-rain", "Thunder and heavy rain storm ambience", 8, 50),
    ("retro-game-sfx", "Retro 8-bit video game coin pickup sound effect", 3, 40),
    ("synth-pad", "Warm analog synth pad with slow filter sweep", 10, 50),
    ("cinematic-hit", "Cinematic orchestral hit with timpani and brass", 5, 50),
]

print("Loading model...")
pipe = StableAudioPipeline.from_pretrained(
    "stabilityai/stable-audio-open-1.0", torch_dtype=torch.float16
).to("cuda")
print(f"Model loaded. Generating {len(SAMPLES)} samples...")

for name, prompt, dur, steps in SAMPLES:
    print(f"\n  Generating: {name} ({dur}s, {steps} steps)")
    t0 = time.time()
    gen = torch.Generator("cuda").manual_seed(42)
    result = pipe(
        prompt,
        negative_prompt="Low quality, noise, distortion",
        num_inference_steps=steps,
        audio_end_in_s=dur,
        num_waveforms_per_prompt=1,
        generator=gen,
    )
    audio = result.audios[0].T.float().cpu().numpy()
    path = os.path.join(OUT, f"{name}.wav")
    sf.write(path, audio, pipe.vae.sampling_rate, subtype="PCM_16")
    elapsed = time.time() - t0
    print(f"  Saved {path} ({elapsed:.1f}s)")

print(f"\nDone! {len(SAMPLES)} samples in {OUT}/")
