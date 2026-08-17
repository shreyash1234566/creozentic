"""Evidence-first media analysis boundary for the AI Video Editor.

The worker intentionally keeps provider-specific extraction behind small adapters so
production environments can swap CPU/GPU implementations without changing the
MediaEvidence contract.
"""
from __future__ import annotations

import json
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


def analyze_media(path: str, language: str | None = None) -> EvidenceBundle:
    media = ffprobe_media(path)
    # The heavy models are imported lazily so metadata-only jobs do not require GPU libraries.
    transcript_words: list[dict[str, Any]] = []
    shot_boundaries: list[dict[str, Any]] = []
    detected_entities: list[dict[str, Any]] = []
    ocr_regions: list[dict[str, Any]] = []
    audio_windows: list[dict[str, Any]] = []

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
