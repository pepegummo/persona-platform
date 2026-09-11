"""SQLAlchemy models. Import this package so every table is registered on `Base.metadata`."""

from app.models.analytics import Event, Report
from app.models.base import Base
from app.models.conversation import Conversation, Message
from app.models.example import Example
from app.models.llm_call import LLMCall
from app.models.persona import Persona, PersonaVersion
from app.models.user import User

__all__ = [
    "Base",
    "Conversation",
    "Event",
    "Example",
    "LLMCall",
    "Message",
    "Persona",
    "PersonaVersion",
    "Report",
    "User",
]
