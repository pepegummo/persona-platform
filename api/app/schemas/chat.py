import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.persona import Visibility


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None


class PublishIn(BaseModel):
    visibility: Visibility = "unlisted"


class PublicPersonaOut(BaseModel):
    """What a visitor may see. Never includes examples marked private."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    display_name: str
    description: str | None
    visibility: Visibility
    version_number: int
    owner_can_read_chats: bool
    label: str = Field(description="Always shown next to the persona name")
    published_at: datetime | None


class PublicExampleOut(BaseModel):
    question: str
    answer: str
