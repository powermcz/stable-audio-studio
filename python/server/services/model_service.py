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

    def check_hf_auth(self) -> dict:
        """Check HuggingFace authentication status and model access."""
        try:
            from huggingface_hub import HfApi
            from huggingface_hub.utils import (
                GatedRepoError,
                RepositoryNotFoundError,
            )

            api = HfApi()
            # Check if user is logged in
            token = api.token
            if not token:
                return {
                    "authenticated": False,
                    "has_access": False,
                    "username": None,
                    "error": "Not logged in to HuggingFace. Run: huggingface-cli login",
                }

            # Check who we are
            try:
                user_info = api.whoami()
                username = user_info.get("name", "unknown")
            except Exception:
                return {
                    "authenticated": False,
                    "has_access": False,
                    "username": None,
                    "error": "HuggingFace token is invalid or expired. Run: huggingface-cli login",
                }

            # Check if we can access the gated model
            try:
                api.model_info(self.MODEL_NAME, token=token)
                has_access = True
                access_error = None
            except GatedRepoError:
                has_access = False
                access_error = (
                    f"You need to accept the license for {self.MODEL_NAME}. "
                    f"Visit: https://huggingface.co/{self.MODEL_NAME}"
                )
            except RepositoryNotFoundError:
                has_access = False
                access_error = f"Model repository not found: {self.MODEL_NAME}"
            except Exception as e:
                has_access = False
                access_error = f"Cannot verify model access: {e}"

            return {
                "authenticated": True,
                "has_access": has_access,
                "username": username,
                "error": access_error,
            }
        except ImportError:
            return {
                "authenticated": False,
                "has_access": False,
                "username": None,
                "error": "huggingface-hub package not installed",
            }

    def is_model_cached(self) -> bool:
        """Check if the model files are already downloaded locally."""
        try:
            from huggingface_hub import scan_cache_dir

            cache_info = scan_cache_dir()
            for repo in cache_info.repos:
                if repo.repo_id == self.MODEL_NAME:
                    return True
        except Exception:
            pass
        return False

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
        except OSError as e:
            err_str = str(e)
            if "401" in err_str or "Unauthorized" in err_str:
                self._error = (
                    "HuggingFace authentication failed. "
                    "Please log in: open a terminal and run 'huggingface-cli login'"
                )
            elif "403" in err_str or "Forbidden" in err_str or "gated repo" in err_str.lower():
                self._error = (
                    "Access denied. You need to accept the Stable Audio Open license at "
                    "https://huggingface.co/stabilityai/stable-audio-open-1.0 "
                    "then restart the app."
                )
            elif "404" in err_str or "not found" in err_str.lower():
                self._error = f"Model not found: {self.MODEL_NAME}"
            elif "resolve" in err_str.lower() or "connection" in err_str.lower():
                if self.is_model_cached():
                    # Try offline mode
                    try:
                        from diffusers import StableAudioPipeline as SAP

                        pipe = SAP.from_pretrained(
                            self.MODEL_NAME, torch_dtype=dtype, local_files_only=True
                        )
                        self.pipe = pipe.to(self.device)
                        self._loading = False
                        return
                    except Exception:
                        pass
                self._error = (
                    "Network error downloading the model. "
                    "Check your internet connection and try again."
                )
            else:
                self._error = f"Failed to load model: {err_str}"
            raise RuntimeError(self._error)
        except torch.cuda.OutOfMemoryError:
            self._error = (
                "Not enough GPU memory. The model needs ~4 GB VRAM. "
                "Close other GPU applications and try again, or switch to CPU in Settings."
            )
            raise RuntimeError(self._error)
        except Exception as e:
            self._error = f"Failed to load model: {e}"
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
            "model_cached": self.is_model_cached(),
            "generating": self._is_generating,
            "generation_progress": self._generation_progress,
            "generation_total": self._generation_total,
        }
