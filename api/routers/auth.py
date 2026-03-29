from __future__ import annotations

import secrets as secrets_mod
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Optional, Union

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from deps import get_access_claims
from models import (
    MfaBackupCode,
    Msp,
    MspMembership,
    PasswordResetToken,
    Profile,
    RefreshToken,
    User,
    UserModulePermission,
)
from rate_limit import check_rate_limit
from schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    MfaEnrollmentRequiredResponse,
    MfaRequiredResponse,
    MfaSetupConfirmRequest,
    MfaVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
)
from security import (
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    new_reset_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

MODULE_KEYS = ["dashboard", "firewall", "reports", "users", "external_domain"]


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def effective_role(platform_role: str, msp_role: str) -> str:
    if platform_role == "super_admin":
        return "super_admin"
    if platform_role == "super_suporte":
        return "super_suporte"
    if msp_role == "workspace_admin":
        return "workspace_admin"
    return "user"


def _perm_to_str(p: Any) -> str:
    return p if isinstance(p, str) else getattr(p, "value", str(p))


def permissions_map(rows: list[UserModulePermission]) -> dict[str, str]:
    base = {k: "view" for k in MODULE_KEYS}
    for row in rows:
        if row.module_name in base:
            base[row.module_name] = _perm_to_str(row.permission)
    return base


def _store_refresh(db: Session, user_id: uuid.UUID, msp_id: uuid.UUID, raw: str) -> None:
    rt = RefreshToken(
        id=uuid.uuid4(),
        user_id=user_id,
        msp_id=msp_id,
        token_hash=hash_token(raw),
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=settings.refresh_token_expire_days),
        created_at=datetime.now(timezone.utc),
    )
    db.add(rt)
    db.commit()


def issue_token_pair(
    db: Session,
    user: User,
    membership: MspMembership,
    msp: Msp,
) -> TokenPair:
    raw_refresh = new_refresh_token()
    _store_refresh(db, user.id, msp.id, raw_refresh)
    pr = _perm_to_str(user.platform_role)
    mr = _perm_to_str(membership.role)
    access = create_access_token(
        str(user.id),
        {
            "type": "access",
            "msp_id": str(msp.id),
            "membership_id": str(membership.id),
            "email": user.email,
            "platform_role": pr,
            "msp_role": mr,
        },
    )
    return TokenPair(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


def _pick_membership(
    db: Session, user_id: uuid.UUID, msp_slug: Optional[str]
) -> tuple[MspMembership, Msp]:
    q = select(MspMembership, Msp).join(Msp).where(MspMembership.user_id == user_id)
    if msp_slug:
        q = q.where(Msp.slug == msp_slug)
    rows = db.execute(q.order_by(MspMembership.created_at)).all()
    if not rows:
        raise HTTPException(status_code=400, detail="Usuario sem vinculo a uma MSP")
    m, s = rows[0]
    return m, s


@router.post("/login", response_model=Union[TokenPair, MfaRequiredResponse, MfaEnrollmentRequiredResponse])
def login(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not check_rate_limit("login:" + _client_key(request), max_calls=20, window=60):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde.")
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Credenciais invalidas")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais invalidas")
    membership, msp = _pick_membership(db, user.id, body.msp_slug)
    if user.mfa_enabled:
        mfa_token = create_access_token(
            str(user.id),
            {
                "type": "mfa",
                "msp_id": str(msp.id),
                "membership_id": str(membership.id),
            },
            expires_delta=timedelta(minutes=settings.mfa_token_expire_minutes),
        )
        return MfaRequiredResponse(mfa_token=mfa_token)
    pair = issue_token_pair(db, user, membership, msp)
    if msp.mfa_required and not user.mfa_enabled:
        return MfaEnrollmentRequiredResponse(
            access_token=pair.access_token,
            refresh_token=pair.refresh_token,
        )
    return pair


@router.post("/mfa/verify", response_model=TokenPair)
def mfa_verify(body: MfaVerifyRequest, request: Request, db: Session = Depends(get_db)):
    if not check_rate_limit("mfa:" + _client_key(request), max_calls=30, window=60):
        raise HTTPException(status_code=429, detail="Muitas tentativas.")
    try:
        from security import decode_token

        payload = decode_token(body.mfa_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token MFA invalido")
    if payload.get("type") != "mfa":
        raise HTTPException(status_code=401, detail="Token MFA invalido")
    uid = uuid.UUID(payload["sub"])
    msp_id = uuid.UUID(payload["msp_id"])
    user = db.get(User, uid)
    if not user or not user.mfa_enabled or not user.mfa_totp_secret:
        raise HTTPException(status_code=400, detail="MFA nao configurado")
    membership = db.execute(
        select(MspMembership).where(
            MspMembership.user_id == uid,
            MspMembership.msp_id == msp_id,
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=400, detail="Membership invalido")
    msp = db.get(Msp, msp_id)
    if not msp:
        raise HTTPException(status_code=400, detail="MSP invalida")
    totp = pyotp.TOTP(user.mfa_totp_secret)
    ok = totp.verify(body.code, valid_window=1)
    if not ok:
        codes = db.execute(
            select(MfaBackupCode).where(
                MfaBackupCode.user_id == uid,
                MfaBackupCode.used_at.is_(None),
            )
        ).scalars().all()
        ok = False
        for row in codes:
            if hash_token(body.code.strip()) == row.code_hash:
                row.used_at = datetime.now(timezone.utc)
                ok = True
                break
        db.commit()
    if not ok:
        raise HTTPException(status_code=401, detail="Codigo invalido")
    return issue_token_pair(db, user, membership, msp)


@router.post("/refresh", response_model=TokenPair)
def rotate_refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    h = hash_token(body.refresh_token)
    row = db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == h,
            RefreshToken.revoked_at.is_(None),
        )
    ).scalar_one_or_none()
    if not row or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh invalido")
    user = db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Refresh invalido")
    msp_id = row.msp_id
    if not msp_id:
        raise HTTPException(status_code=401, detail="Refresh invalido")
    membership = db.execute(
        select(MspMembership).where(
            MspMembership.user_id == user.id,
            MspMembership.msp_id == msp_id,
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=401, detail="Refresh invalido")
    msp = db.get(Msp, msp_id)
    if not msp:
        raise HTTPException(status_code=401, detail="Refresh invalido")
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return issue_token_pair(db, user, membership, msp)


@router.post("/logout")
def logout(
    body: RefreshRequest,
    db: Session = Depends(get_db),
):
    h = hash_token(body.refresh_token)
    row = db.execute(select(RefreshToken).where(RefreshToken.token_hash == h)).scalar_one_or_none()
    if row:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(
    claims: Annotated[dict, Depends(get_access_claims)],
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(claims["sub"])
    msp_id = uuid.UUID(claims["msp_id"])
    user = db.get(User, uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario invalido")
    msp = db.get(Msp, msp_id)
    if not msp:
        raise HTTPException(status_code=400, detail="MSP invalida")
    membership = db.execute(
        select(MspMembership).where(
            MspMembership.user_id == uid,
            MspMembership.msp_id == msp_id,
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=400, detail="Sem acesso a esta MSP")
    profile = db.get(Profile, uid)
    rows = db.execute(
        select(UserModulePermission).where(
            UserModulePermission.user_id == uid,
            UserModulePermission.msp_id == msp_id,
        )
    ).scalars().all()
    perms = permissions_map(list(rows))
    pr = _perm_to_str(user.platform_role)
    mr = _perm_to_str(membership.role)
    eff = effective_role(pr, mr)
    prof_dict = {
        "id": str(uid),
        "email": profile.email if profile else user.email,
        "full_name": profile.full_name if profile else None,
        "avatar_url": profile.avatar_url if profile else None,
        "timezone": profile.timezone if profile else "UTC",
    }
    return MeResponse(
        user_id=uid,
        email=user.email,
        msp_id=msp_id,
        msp_slug=msp.slug,
        msp_name=msp.name,
        platform_role=pr,
        msp_role=mr,
        effective_role=eff,
        profile=prof_dict,
        permissions=perms,
        mfa_enabled=user.mfa_enabled,
        mfa_required_by_msp=msp.mfa_required,
    )


@router.post("/forgot-password")
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not check_rate_limit("fp:" + _client_key(request), max_calls=10, window=300):
        raise HTTPException(status_code=429, detail="Aguarde antes de tentar novamente.")
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    msg: dict[str, Any] = {"ok": True}
    if user and user.is_active:
        raw = new_reset_token()
        row = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=settings.password_reset_expire_minutes),
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
        if settings.debug:
            msg["debug_reset_token"] = raw
    return msg


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    if not check_rate_limit("rp:" + _client_key(request), max_calls=15, window=300):
        raise HTTPException(status_code=429, detail="Aguarde.")
    h = hash_token(body.token)
    row = db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == h,
            PasswordResetToken.used_at.is_(None),
        )
    ).scalar_one_or_none()
    if not row or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Link invalido ou expirado")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Link invalido")
    user.password_hash = hash_password(body.new_password)
    row.used_at = datetime.now(timezone.utc)
    db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    db.commit()
    return {"ok": True}


@router.post("/mfa/setup/start")
def mfa_setup_start(
    claims: Annotated[dict, Depends(get_access_claims)],
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(claims["sub"])
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404)
    if user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA ja esta ativo")
    secret = pyotp.random_base32()
    user.mfa_totp_secret = secret
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    issuer = "iScope360"
    label = user.email
    uri = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)
    return {"secret": secret, "otpauth_url": uri}


@router.post("/mfa/setup/confirm")
def mfa_setup_confirm(
    body: MfaSetupConfirmRequest,
    claims: Annotated[dict, Depends(get_access_claims)],
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(claims["sub"])
    user = db.get(User, uid)
    if not user or not user.mfa_totp_secret:
        raise HTTPException(status_code=400, detail="Inicie o cadastro MFA primeiro")
    totp = pyotp.TOTP(user.mfa_totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Codigo invalido")
    user.mfa_enabled = True
    user.updated_at = datetime.now(timezone.utc)
    db.execute(delete(MfaBackupCode).where(MfaBackupCode.user_id == uid))
    codes: list[str] = []
    for _ in range(8):
        c = secrets_mod.token_hex(4)
        codes.append(c)
        db.add(
            MfaBackupCode(
                id=uuid.uuid4(),
                user_id=uid,
                code_hash=hash_token(c),
                created_at=datetime.now(timezone.utc),
            )
        )
    db.commit()
    return {"ok": True, "backup_codes": codes}


@router.post("/register", response_model=TokenPair)
def register(
    body: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not settings.allow_public_register:
        raise HTTPException(status_code=403, detail="Registro publico desabilitado")
    if not check_rate_limit("reg:" + _client_key(request), max_calls=5, window=3600):
        raise HTTPException(status_code=429)
    msp = db.get(Msp, body.msp_id)
    if not msp:
        raise HTTPException(status_code=400, detail="MSP invalida")
    exists = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="Email ja cadastrado")
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        email=body.email.lower(),
        password_hash=hash_password(body.password),
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
            full_name=body.full_name,
            timezone="UTC",
        )
    )
    mem = MspMembership(
        id=uuid.uuid4(),
        user_id=user.id,
        msp_id=msp.id,
        role="user",
        created_at=now,
    )
    db.add(mem)
    for mod in MODULE_KEYS:
        db.add(
            UserModulePermission(
                id=uuid.uuid4(),
                msp_id=msp.id,
                user_id=user.id,
                module_name=mod,
                permission="view",
            )
        )
    db.commit()
    return issue_token_pair(db, user, mem, msp)
