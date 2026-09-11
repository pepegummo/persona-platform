from pydantic import BaseModel, ConfigDict, Field


class StyleCard(BaseModel):
    """Output of prompts/compiler.md, stored in persona_versions.style_card."""

    model_config = ConfigDict(extra="ignore")

    summary: str = Field(min_length=1)
    language: str = ""
    length: str = ""
    structure: list[str] = Field(default_factory=list)
    formatting: list[str] = Field(default_factory=list)
    vocabulary: list[str] = Field(default_factory=list)
    by_shape: dict[str, str] = Field(default_factory=dict)
    avoid: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)


class ShapeResult(BaseModel):
    shape: str
