import importlib.util

modules = [
    "torch",
    "torchaudio",
    "faster_whisper",
    "whisperx",
    "pyannote.audio",
    "gradio",
    "yaml",
    "fastapi",
    "moviepy",
    "cv2",
    "transformers",
    "diffusers",
]

for module in modules:
    try:
        available = importlib.util.find_spec(module) is not None
    except ModuleNotFoundError:
        available = False
    print(f"{module}: {available}")
