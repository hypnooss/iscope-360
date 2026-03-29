import uuid
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    msp_slug: Optional[str] = None

class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class MfaRequiredResponse(BaseModel):
    status: Literal["mfa_required"] = "mfa_required"
    mfa_token: str

class MfaEnrollmentRequiredResponse(BaseModel):
    status: Literal["mfa_enrollment_required"] = "mfa_enrollment_required"
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    message: str = "MFA obrigatorio para esta organizacao. Conclua o cadastro do autenticador."

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=12)

class MfaSetupConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)

class RefreshRequest(BaseModel):
    refresh_token: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str
    msp_id: uuid.UUID

class MeResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    msp_id: uuid.UUID
    msp_slug: str
    msp_name: str
    platform_role: str
    msp_role: str
    effective_role: str
    profile: dict
    permissions: dict[str, str]
    mfa_enabled: bool
    mfa_required_by_msp: bool
