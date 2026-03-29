"""Cria MSP demo, usuario admin e permissoes. Executar apos migrations SQL."""
from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone

from passlib.context import CryptContext
from sqlalchemy import select

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def main() -> None:
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, os.getcwd())

    from database import SessionLocal
    from models import Msp, MspMembership, Profile, User, UserModulePermission

    email = os.getenv("SEED_EMAIL", "dev@iscope.local")
    password = os.getenv("SEED_PASSWORD", "DevPass123!")
    msp_slug = os.getenv("SEED_MSP_SLUG", "demo-msp")

    db = SessionLocal()
    try:
        existing = db.execute(select(Msp).where(Msp.slug == msp_slug)).scalar_one_or_none()
        if existing:
            print("MSP demo ja existe, nada a fazer.")
            return

        now = datetime.now(timezone.utc)
        msp = Msp(
            id=uuid.uuid4(),
            name="MSP Demo",
            slug=msp_slug,
            mfa_required=False,
            created_at=now,
            updated_at=now,
        )
        db.add(msp)
        db.flush()

        user = User(
            id=uuid.uuid4(),
            email=email.lower(),
            password_hash=pwd.hash(password),
            platform_role="none",
            is_active=True,
            mfa_enabled=False,
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        db.flush()

        db.add(
            Profile(
                id=user.id,
                email=user.email,
                full_name="Usuario Demo",
                timezone="UTC",
            )
        )
        mem = MspMembership(
            id=uuid.uuid4(),
            user_id=user.id,
            msp_id=msp.id,
            role="workspace_admin",
            created_at=now,
        )
        db.add(mem)

        modules = ["dashboard", "firewall", "reports", "users", "external_domain"]
        for mod in modules:
            db.add(
                UserModulePermission(
                    id=uuid.uuid4(),
                    msp_id=msp.id,
                    user_id=user.id,
                    module_name=mod,
                    permission="full",
                )
            )
        db.commit()
        print(f"OK: MSP {msp_slug} e usuario {email} criados.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
