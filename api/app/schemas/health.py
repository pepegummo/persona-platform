from typing import Literal

from pydantic import BaseModel


class HealthOk(BaseModel):
    status: Literal["ok"] = "ok"


class HealthDegraded(BaseModel):
    status: Literal["degraded"] = "degraded"
    db: Literal["ok", "error"]
    redis: Literal["ok", "error"]
