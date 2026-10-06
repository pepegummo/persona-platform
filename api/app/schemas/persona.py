import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Language = Literal["th", "en", "mixed"]
AnswerLength = Literal["short", "medium", "long"]
TechnicalLevel = Literal["beginner", "intermediate", "expert"]
Mode = Literal["simple", "like_me"]
Visibility = Literal["private", "unlisted", "public"]
VersionStatus = Literal["draft", "compiling", "ready", "failed"]
Shape = Literal[
    "comparison",
    "how_to",
    "definition",
    "troubleshooting",
    "opinion",
    "recommendation",
    "casual",
    "other",
]

SLUG_PATTERN = r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$"

# Limits for the key→value maps (`profile`, `vocabulary`) so the runtime prompt stays short.
KV_MAX_ENTRIES = 30
KV_MAX_KEY = 40
KV_MAX_VALUE = 200


def validate_kv_map(items: dict[str, str]) -> dict[str, str]:
    """Strip keys/values; empty keys, duplicates, and over-limit sizes are errors, not dropped."""
    cleaned: dict[str, str] = {}
    for raw_key, raw_value in items.items():
        key, value = raw_key.strip(), raw_value.strip()
        if not key:
            raise ValueError("keys must not be empty")
        if len(key) > KV_MAX_KEY:
            raise ValueError(f"key '{key[:20]}…' is longer than {KV_MAX_KEY} characters")
        if len(value) > KV_MAX_VALUE:
            raise ValueError(f"value for '{key}' is longer than {KV_MAX_VALUE} characters")
        if key in cleaned:
            raise ValueError(f"duplicate key '{key}'")
        cleaned[key] = value
    if len(cleaned) > KV_MAX_ENTRIES:
        raise ValueError(f"at most {KV_MAX_ENTRIES} entries are allowed")
    return cleaned


class PersonaSettings(BaseModel):
    """Stored as `persona_versions.settings` (jsonb). Free-text fields may be Thai or English."""

    model_config = ConfigDict(extra="forbid")

    language: Language = "mixed"
    tone: str = Field(default="", max_length=200)
    answer_length: AnswerLength = "medium"
    technical_level: TechnicalLevel = "intermediate"
    personality: str = Field(default="", max_length=500)
    writing_style: str = Field(default="", max_length=500)
    formatting: list[str] = Field(default_factory=list, max_length=20)
    # ข้อมูลพื้นฐาน — facts about the person (อายุ, ราศี, สีที่ชอบ …). Runtime prompt only.
    profile: dict[str, str] = Field(default_factory=dict)
    # คำที่ใช้บ่อย / slang — word → meaning + when it is used. Runtime and compiler.
    vocabulary: dict[str, str] = Field(default_factory=dict)

    @field_validator("profile", "vocabulary")
    @classmethod
    def _check_kv(cls, value: dict[str, str]) -> dict[str, str]:
        return validate_kv_map(value)


class PersonaCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    slug: str | None = Field(default=None, pattern=SLUG_PATTERN)
    description: str | None = Field(default=None, max_length=1000)
    settings: PersonaSettings = Field(default_factory=PersonaSettings)
    rules: str = Field(default="", max_length=4000)
    mode: Mode = "simple"


class PersonaUpdate(BaseModel):
    """Partial update. Any field other than `slug` edits the version (see PersonaService)."""

    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    slug: str | None = Field(default=None, pattern=SLUG_PATTERN)
    description: str | None = Field(default=None, max_length=1000)
    settings: PersonaSettings | None = None
    rules: str | None = Field(default=None, max_length=4000)
    mode: Mode | None = None


class ExampleCreate(BaseModel):
    question: str = Field(min_length=1, max_length=8000)
    answer: str = Field(min_length=1, max_length=16000)
    is_private: bool = True


class ExampleUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=8000)
    answer: str | None = Field(default=None, min_length=1, max_length=16000)
    is_private: bool | None = None


class ExampleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question: str
    answer: str
    shape: Shape | None
    is_private: bool
    is_held_out: bool
    synthetic_of: uuid.UUID | None
    created_at: datetime


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: int
    status: VersionStatus
    display_name: str
    description: str | None
    settings: PersonaSettings
    rules: str
    mode: Mode
    style_card: dict[str, Any] | None
    fixed_example_ids: list[uuid.UUID]
    compiled_at: datetime | None
    created_at: datetime
    examples: list[ExampleOut]


class VersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: int
    status: VersionStatus
    display_name: str
    compiled_at: datetime | None
    created_at: datetime


class PersonaOut(BaseModel):
    id: uuid.UUID
    slug: str
    visibility: Visibility
    owner_can_read_chats: bool
    published_version_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    draft: VersionOut = Field(description="The latest version; the one edits apply to")
    published: VersionSummary | None


class PersonaListItem(BaseModel):
    id: uuid.UUID
    slug: str
    visibility: Visibility
    display_name: str
    description: str | None
    mode: Mode
    status: VersionStatus
    version_number: int
    example_count: int
    published_version_id: uuid.UUID | None
    updated_at: datetime


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clerk_user_id: str
    display_name: str
    locale: str
