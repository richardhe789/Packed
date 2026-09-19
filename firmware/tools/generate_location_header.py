# Generates a non-secret header from the repository's one location configuration.
# PlatformIO runs this before compilation; edit location.config.json, never this output.
Import("env")

import json
from pathlib import Path

root = Path(env["PROJECT_DIR"]).parent
config = json.loads((root / "location.config.json").read_text(encoding="utf-8"))
location_id = config.get("id", "")
if not location_id or not all(c.islower() or c.isdigit() or c == "_" for c in location_id):
    raise ValueError("location.config.json id must use lowercase letters, numbers, and underscores")

header = f'''// Generated from ../../location.config.json. Do not edit.
#pragma once
#ifdef LOCATION_ID
#undef LOCATION_ID  // Ignore obsolete local config.h location overrides.
#endif
#define LOCATION_ID "{location_id}"
'''
(Path(env["PROJECT_DIR"]) / "include" / "location_config.generated.h").write_text(
    header, encoding="utf-8"
)
