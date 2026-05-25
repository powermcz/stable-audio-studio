"""Model loading and management service using diffusers."""

import threading
import torch
from typing import Optional


class ModelService:
    """Manages the Stable Audio model lifecycle via HuggingFace diffusers."""

    MODEL_NAME = "stabilityai/stable-audio-open-1.0"

    def __init__(self):
        self.pipe = None
        self._loading = False
        self._error: Optional[str] = None
        self._lock = threading.Lock()
        self._generation_progress = 0
        self._generation_total = 0
        self._is_generating = False

    @property
    def device(self) -> str:
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    @property
    def loaded(self) -> bool:
        return self.pipe is not None

    @property
    def loading(self) -> bool:
        return self._loading

    @property
    def error(self) -> Optional[str]:
        return self._error

    @property
    def sample_rate(self) -> int:
        if self.pipe is not None:
            return self.pipe.vae.sampling_rate
        return 44100  # default for Stable Audio Open

    def load(self) -> None:
        """Load the model into memory."""
        with self._lock:
            if self.pipe is not None or self._loading:
                return
            self._loading = True
            self._error = None

        try:
            from diffusers import StableAudioPipeline

            dtype = torch.float16 if self.device == "cuda" else torch.float32
            pipe = StableAudioPipeline.from_pretrained(
                self.MODEL_NAME, torch_dtype=dtype
            )
            self.pipe = pipe.to(self.device)
        except Exception as e:
            self._error = str(e)
            raise
        finally:
            self._loading = False

    def ensure_loaded(self) -> None:
        """Ensure the model is loaded, loading it if necessary."""
        if not self.loaded:
            self.load()

    def get_status(self) -> dict:
        return {
            "loaded": self.loaded,
            "loading": self._loading,
            "device": self.device,
            "model_name": self.MODEL_NAME,
            "error": self._error,
            "generating": self._is_generating,
            "generation_progress": self._generation_progress,
            "generation_total": self._generation_total,
        }
