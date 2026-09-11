"""Arq job: compile_version(version_id)."""

import logging
import uuid
from typing import Any

from app.services.compile import Compiler

log = logging.getLogger(__name__)


async def compile_version(ctx: dict[str, Any], version_id: str) -> str:
    async with ctx["session_factory"]() as db:
        compiler = Compiler(db, ctx["router"], ctx["redis"], ctx["settings"])
        version = await compiler.run(uuid.UUID(version_id))
        log.info("compile_version %s -> %s", version_id, version.status)
        return version.status
