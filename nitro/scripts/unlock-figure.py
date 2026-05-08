#!/usr/bin/env python3
"""Set club=0 on every figure set so HC items are not gated in the avatar editor.

Idempotent: running it on already-unlocked data is a no-op. Safe to run on
every container start.
"""
import json
import sys
from pathlib import Path

DEFAULT_PATH = Path("/app/nitro-assets/gamedata/FigureData.json")


def unlock(path: Path) -> None:
    if not path.exists():
        print(f"unlock-figure: {path} not found, skipping")
        return

    with path.open() as f:
        data = json.load(f)

    changed = 0
    total = 0
    for set_type in data.get("setTypes", []):
        for s in set_type.get("sets", []):
            total += 1
            if s.get("club", 0) != 0:
                s["club"] = 0
                changed += 1

    if changed == 0:
        print(f"unlock-figure: already unlocked ({total} sets)")
        return

    with path.open("w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"unlock-figure: unlocked {changed} / {total} sets in {path}")


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    unlock(path)
