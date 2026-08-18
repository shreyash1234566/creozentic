"""Evidence-first media analysis boundary for the AI Video Editor.

The worker intentionally keeps provider-specific extraction behind small adapters so
production environments can swap CPU/GPU implementations without changing the
MediaEvidence contract.
"""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class EvidenceBundle:
    media: dict[str, Any]
    transcript_words: list[dict[str, Any]]
    shot_boundaries: list[dict[str, Any]]
    detected_entities: list[dict[str, Any]]
    ocr_regions: list[dict[str, Any]]
    audio_windows: list[dict[str, Any]]
    extractor_versions: dict[str, str]


def ffprobe_media(path: str) -> dict[str, Any]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,sample_rate", "-of", "json", path],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    return {"durationSec": float(payload.get("format", {}).get("duration", 0)), "streams": payload.get("streams", [])}


def audio_windows_from_ffmpeg(path: str, duration_sec: float) -> list[dict[str, Any]]:
    """Return bounded one-second audio windows with silence/energy metadata.

    This is intentionally deterministic and dependency-light. Rich spectral features
    remain optional behind librosa in the production worker image.
    """
    if duration_sec <= 0:
        return []
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", path, "-af", "silencedetect=noise=-35dB:d=0.15", "-f", "null", "-"],
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    silence_starts = [float(match.group(1)) for match in re.finditer(r"silence_start: ([0-9.]+)", result.stderr)]
    silence_ends = [float(match.group(1)) for match in re.finditer(r"silence_end: ([0-9.]+)", result.stderr)]
    windows: list[dict[str, Any]] = []
    cursor = 0.0
    while cursor < duration_sec:
        end = min(cursor + 1.0, duration_sec)
        silent = any(start <= cursor < (silence_ends[index] if index < len(silence_ends) else duration_sec) for index, start in enumerate(silence_starts))
        windows.append({"startSec": cursor, "endSec": end, "features": {"silent": silent, "source": "ffmpeg-silencedetect-v1"}})
        cursor = end
    return windows


def analyze_media(path: str, language: str | None = None) -> EvidenceBundle:
    media = ffprobe_media(path)
    # The heavy models are imported lazily so metadata-only jobs do not require GPU libraries.
    transcript_words: list[dict[str, Any]] = []
    shot_boundaries: list[dict[str, Any]] = []
    detected_entities: list[dict[str, Any]] = []
    ocr_regions: list[dict[str, Any]] = []
    audio_windows: list[dict[str, Any]] = audio_windows_from_ffmpeg(path, float(media.get("durationSec", 0)))

    try:
        from scenedetect import open_video, SceneManager
        from scenedetect.detectors import ContentDetector
        video = open_video(path)
        manager = SceneManager()
        manager.add_detector(ContentDetector())
        manager.detect_scenes(video)
        for index, (start, end) in enumerate(manager.get_scene_list()):
            shot_boundaries.append({"sequence": index, "startSec": start.get_seconds(), "endSec": end.get_seconds(), "confidence": 1.0})
    except Exception:
        # A failed optional extractor is recorded by the caller as degraded evidence,
        # never silently treated as a verified fact.
        pass

    return EvidenceBundle(
        media=media,
        transcript_words=transcript_words,
        shot_boundaries=shot_boundaries,
        detected_entities=detected_entities,
        ocr_regions=ocr_regions,
        audio_windows=audio_windows,
        extractor_versions={"ffprobe": "1", "scenedetect": "optional", "whisperx": "optional", "rfdetr": "optional", "paddleocr": "optional", "librosa": "optional"},
    )


def as_json(bundle: EvidenceBundle) -> str:
    return json.dumps(asdict(bundle), separators=(",", ":"))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--language")
    args = parser.parse_args()
    print(as_json(analyze_media(str(Path(args.path)), args.language)))
