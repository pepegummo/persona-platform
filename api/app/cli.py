"""Small maintenance commands. Usage: `uv run python -m app.cli openapi > openapi.json`."""

import json
import sys

from app.main import app


def main(argv: list[str]) -> int:
    if argv[1:] == ["openapi"]:
        json.dump(app.openapi(), sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    sys.stderr.write("usage: python -m app.cli openapi\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
