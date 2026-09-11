from fastapi import APIRouter

from app.auth import CurrentUser
from app.schemas.persona import UserOut

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("", response_model=UserOut)
async def get_me(user: CurrentUser) -> UserOut:
    """Returns the signed-in user, creating the row on first call."""
    return UserOut.model_validate(user)
