"""Role-based access for the admin panel.

Roles:
  owner  the website owner (role "video_admin", or the VIDEO_ADMIN_EMAIL account): everything
  admin  team administrator: everything except managing the owner account
  agent  sales team member: leads, customers, follow-ups, notifications and reports
"""

from fastapi import Depends, HTTPException, status

from .dependencies import get_current_user
from .models import User

STAFF_ROLES = ("owner", "admin", "agent")


def staff_role(user: User) -> str | None:
    from .routers.auth import is_video_admin  # avoid a circular import

    if is_video_admin(user):
        return "owner"
    if user.role in ("admin", "agent") and user.is_active:
        return user.role
    return None


def require_staff(*allowed: str):
    """Dependency: the signed-in user must have one of `allowed` roles (default: any staff role)."""
    roles = allowed or STAFF_ROLES

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        role = staff_role(current_user)
        if role is None or role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account does not have access to this section.",
            )
        current_user.staff_role = role  # handy for handlers
        return current_user

    return dependency


require_any_staff = require_staff()
require_manager = require_staff("owner", "admin")
require_owner = require_staff("owner")
