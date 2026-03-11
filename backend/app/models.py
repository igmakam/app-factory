from pydantic import BaseModel, field_validator, model_validator, ConfigDict
from typing import Optional, List, Any, Union
from datetime import datetime


class _DtModel(BaseModel):
    """Base model that auto-converts datetime fields to ISO strings."""
    model_config = ConfigDict(json_encoders={datetime: lambda v: v.isoformat()})

    @model_validator(mode="before")
    @classmethod
    def _coerce_datetimes(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        for k, v in data.items():
            if isinstance(v, datetime):
                data[k] = v.isoformat()
        return data


# ==================== AUTH ====================

class UserRegister(BaseModel):
    email: str
    password: str
    full_name: str = ""

class UserLogin(BaseModel):
    email: str
    password: str

def _dt(v: Any) -> str:
    """Convert datetime/None to ISO string for all response models."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


class UserResponse(_DtModel):
    id: int
    email: str
    full_name: str
    avatar_url: str
    created_at: str = ""

    @field_validator("created_at", mode="before")
    @classmethod
    def coerce_created_at(cls, v):
        return _dt(v)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==================== CREDENTIALS ====================

class CredentialSave(BaseModel):
    credential_type: str  # apple, google, github, ios_signing, android_signing
    credential_data: dict

class CredentialStatus(_DtModel):
    credential_type: str
    is_configured: bool
    is_valid: bool
    validated_at: Optional[str] = None
    updated_at: Optional[str] = None


# ==================== PROJECTS ====================

class ProjectCreate(BaseModel):
    name: str
    bundle_id: str = ""
    github_repo: str = ""
    platform: str = "both"  # ios, android, both
    icon_url: str = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    bundle_id: Optional[str] = None
    github_repo: Optional[str] = None
    platform: Optional[str] = None
    status: Optional[str] = None
    icon_url: Optional[str] = None

class ProjectResponse(_DtModel):
    id: int
    name: str
    bundle_id: str
    github_repo: str
    platform: str
    status: str
    icon_url: str
    created_at: str
    updated_at: str
    questionnaire_complete: bool = False
    listing_generated: bool = False


# ==================== QUESTIONNAIRE ====================

class QuestionnaireQuestion(BaseModel):
    key: str
    question: str
    description: str
    input_type: str  # text, textarea, select, multiselect
    options: List[str] = []
    required: bool = True
    category: str = "general"

class QuestionnaireAnswer(BaseModel):
    question_key: str
    answer_text: str

class QuestionnaireSubmit(BaseModel):
    answers: List[QuestionnaireAnswer]


# ==================== STORE LISTINGS ====================

class StoreListingResponse(_DtModel):
    id: int
    project_id: int
    platform: str
    locale: str
    title: str
    subtitle: str
    description: str
    keywords: str
    whats_new: str
    promotional_text: str
    category: str
    secondary_category: str
    pricing_model: str
    price: str
    privacy_url: str
    support_url: str
    marketing_url: str
    aso_score: int
    aso_tips: str  # JSON string
    viral_hooks: str  # JSON string
    growth_strategies: str  # JSON string
    competitor_analysis: str
    generated_by_ai: bool
    created_at: str
    updated_at: str

class StoreListingUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    whats_new: Optional[str] = None
    promotional_text: Optional[str] = None
    category: Optional[str] = None
    secondary_category: Optional[str] = None
    pricing_model: Optional[str] = None
    price: Optional[str] = None
    privacy_url: Optional[str] = None
    support_url: Optional[str] = None
    marketing_url: Optional[str] = None


# ==================== PIPELINE ====================

class PipelineStepResponse(_DtModel):
    id: int
    step_name: str
    step_order: int
    platform: str
    status: str
    log_output: str
    error_message: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

class PipelineRunResponse(_DtModel):
    id: int
    project_id: int
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str
    steps: List[PipelineStepResponse] = []


# ==================== DASHBOARD ====================

class DashboardResponse(BaseModel):
    total_projects: int
    projects_in_review: int
    projects_live: int
    projects_launching: int
    total_generations: int
    total_tokens_used: int
    setup_complete: bool
    recent_projects: list


# ==================== SETTINGS ====================

class SettingUpdate(BaseModel):
    key: str
    value: str
