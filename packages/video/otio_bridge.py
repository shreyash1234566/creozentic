from __future__ import annotations

from typing import Any


def edit_plan_to_otio(plan: dict[str, Any]):
    """Map an EditPlanVersion payload to OTIO primitives without inventing media."""
    import opentimelineio as otio

    timeline = otio.schema.Timeline(name=f"editor-plan-v{plan['version']}")
    track = otio.schema.Track(name="main", kind="Video")
    for beat in sorted(plan.get("beats", []), key=lambda item: item["sequence"]):
        duration = max(0.0, float(beat["endSec"]) - float(beat["startSec"]))
        clip = otio.schema.Clip(name=beat["label"], source_range=otio.opentime.TimeRange(duration=otio.opentime.RationalTime(duration, 1)))
        clip.metadata["evidenceIds"] = beat.get("evidenceIds", [])
        track.append(clip)
    timeline.tracks.append(track)
    return timeline
