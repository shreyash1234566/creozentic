"""License-aware bridge for the cloned core media projects.

The bridge never imports upstream application internals into the web process. It
runs approved worker entrypoints in isolated subprocesses and returns a stable
JSON envelope to the Creozentic queue consumer. Paths and provider credentials
are supplied through environment variables, never source control.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(os.getenv("CORE_ENGINE_REF_ROOT", str(Path(__file__).resolve().parents[2] / "third_party")))

ENGINES: dict[str, dict[str, Any]] = {
    "openshorts": {
        "repo": ROOT / "openshorts",
        "license": "MIT core; cloud directory separately licensed",
        "commands": {"repurpose": ["python3", "main.py"]},
    },
    "ave": {
        "repo": ROOT / "ave",
        "license": "MIT",
        "commands": {"direct": ["python3", "-m", "ave"]},
    },
    "pixeltable": {
        "repo": ROOT / "pixeltable",
        "license": "Apache-2.0",
        "commands": {"index": ["python3", "-m", "pixeltable"]},
    },
    "vimax": {
        "repo": ROOT / "vimax",
        "license": "MIT",
        "commands": {
            "idea2video": ["python3", "main_idea2video.py"],
            "script2video": ["python3", "main_script2video.py"],
        },
    },
    "videoagent": {
        "repo": ROOT / "videoagent",
        "license": "MIT",
        "commands": {"direct": ["python3", "main.py"]},
    },
    "videodb-director": {
        "repo": ROOT / "videodb-director",
        "license": "MIT",
        "commands": {"direct": ["python3", "-m", "backend"]},
    },
    "openchatcut": {
        "repo": ROOT / "openchatcut",
        "license": "AGPL-3.0",
        "commands": {"direct": ["pnpm", "run", "start"]},
    },
    "openmontage": {
        "repo": ROOT / "openmontage",
        "license": "AGPL-3.0",
        "commands": {"direct": ["pnpm", "run", "render"]},
    },
    "cutscript": {
        "repo": ROOT / "cutscript",
        "license": "MIT",
        "commands": {"serve": ["python3", "backend/main.py"]},
    },
    "videoclipper": {
        "repo": ROOT / "videoclipper",
        "license": "Repository license; inspect package terms before SaaS use",
        "commands": {"serve": ["pnpm", "dev"]},
    },
    "ai-broll": {
        "repo": ROOT / "ai-broll",
        "license": "MIT",
        "commands": {"notebook": ["python3", "-m", "jupyter", "nbconvert", "--to", "notebook"]},
    },
    "funclip": {
        "repo": ROOT / "funclip",
        "license": "Apache-2.0",
        "commands": {"serve": ["python3", "funclip/launch.py"]},
    },
    "twick": {
        "repo": ROOT / "twick",
        "license": "Sustainable Use License 1.0",
        "commands": {"direct": ["pnpm", "run", "render"]},
    },
}


def run_engine(engine: str, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
    spec = ENGINES.get(engine)
    if spec is None:
        raise ValueError(f"Unsupported engine: {engine}")
    if os.getenv(f"{engine.upper().replace('-', '_')}_ENABLED") != "true":
        return {
            "status": "DISABLED",
            "engine": engine,
            "operation": operation,
            "reason": f"Set {engine.upper().replace('-', '_')}_ENABLED=true after license/runtime approval",
        }
    repo = Path(spec["repo"])
    if not repo.is_dir():
        return {"status": "UNAVAILABLE", "engine": engine, "operation": operation, "reason": str(repo)}
    command = spec["commands"].get(operation) or spec["commands"].get("direct")
    if not command:
        raise ValueError(f"No operation {operation!r} for {engine}")
    input_path = payload.get("input_path")
    if input_path:
        command = [*command, str(input_path)]
    result = subprocess.run(
        command,
        cwd=repo,
        env={**os.environ, "CREOZENTIC_JOB_JSON": json.dumps(payload)},
        capture_output=True,
        text=True,
        timeout=int(os.getenv("CORE_ENGINE_TIMEOUT_SECONDS", "1800")),
        check=False,
    )
    return {
        "status": "SUCCEEDED" if result.returncode == 0 else "FAILED",
        "engine": engine,
        "operation": operation,
        "exit_code": result.returncode,
        "stdout": result.stdout[-20_000:],
        "stderr": result.stderr[-20_000:],
        "license": spec["license"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("engine", choices=sorted(ENGINES))
    parser.add_argument("operation")
    parser.add_argument("payload_json")
    args = parser.parse_args()
    payload = json.loads(args.payload_json)
    print(json.dumps(run_engine(args.engine, args.operation, payload)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
