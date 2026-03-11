const API_URL = import.meta.env.VITE_API_URL || '';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }

  return res.json();
}

// ==================== TYPES ====================

export interface User {
  id: number;
  email: string;
  full_name: string;
  avatar_url: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface CredentialStatus {
  credential_type: string;
  is_configured: boolean;
  is_valid: boolean;
  validated_at: string | null;
  updated_at: string | null;
}

export interface Project {
  id: number;
  name: string;
  bundle_id: string;
  github_repo: string;
  platform: string;
  status: string;
  icon_url: string;
  created_at: string;
  updated_at: string;
  questionnaire_complete: boolean;
  listing_generated: boolean;
}

export interface QuestionnaireQuestion {
  key: string;
  question: string;
  description: string;
  input_type: string;
  options?: string[];
  required: boolean;
  category: string;
}

export interface StoreListing {
  id: number;
  project_id: number;
  platform: string;
  locale: string;
  title: string;
  subtitle: string;
  description: string;
  keywords: string;
  whats_new: string;
  promotional_text: string;
  category: string;
  secondary_category: string;
  pricing_model: string;
  price: string;
  aso_score: number;
  aso_tips: string;
  viral_hooks: string;
  growth_strategies: string;
  competitor_analysis: string;
  generated_by_ai: number;
}

export interface PipelineStep {
  id: number;
  step_name: string;
  step_order: number;
  platform: string;
  status: string;
  log_output: string;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface PipelineRun {
  id: number;
  project_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  steps: PipelineStep[];
}

export interface RFactorStep {
  step_name: string;
  r_status: 'real' | 'system_retry' | 'needs_input' | 'active' | 'pending' | 'in_progress';
  r_detail: string;
}

export interface RFactor {
  score: number;
  total: number;
  percentage: number;
  label: string;
  real_count: number;
  system_retry_count: number;
  needs_input_count: number;
  steps: RFactorStep[];
  next_steps: string[];
}

export interface Notification {
  id: number;
  user_id: number;
  project_id: number | null;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface DashboardData {
  total_projects: number;
  projects_in_review: number;
  projects_live: number;
  projects_launching: number;
  total_generations: number;
  total_tokens_used: number;
  setup_complete: boolean;
  recent_projects: Project[];
}

export interface GenerateResult {
  message: string;
  platforms: Array<{
    platform: string;
    title: string;
    subtitle: string;
    aso_score: number;
    viral_hooks_count: number;
    growth_strategies_count: number;
    launch_day_plan: Record<string, string[]>;
    additional_recommendations: string[];
    positioning_statement: string;
    blue_ocean_opportunities: string[];
    all_keywords: {
      primary: string[];
      long_tail: string[];
      trending: string[];
      competitor: string[];
    };
  }>;
  total_tokens_used: number;
}

// ==================== HELIXA TYPES ====================

export interface HelixaIdeaSummary {
  id: number;
  idea_name: string;
  product_type: string;
  overall_score: number;
  created_at: string;
}

export interface HelixaIdea {
  id: number;
  user_id: number;
  raw_input: string;
  idea_name: string;
  product_type: string;
  overall_score: number;
  structured_idea: {
    idea_name: string;
    product_type: string;
    problem_statement: string;
    proposed_solution: string;
    target_users: string;
    use_case: string;
    monetization_model: string;
    core_value_proposition: string;
  };
  scores: {
    viability_score: number;
    competition_density: number;
    market_demand: number;
    build_complexity: number;
    monetization_strength: number;
    scalability: number;
    overall_score: number;
    scoring_notes: Record<string, string>;
    methodology?: {
      weights: Record<string, number>;
      weight_rationale: Record<string, string>;
      overall_formula: string;
      scoring_criteria: Record<string, string>;
    };
  };
  valuation: {
    summary?: Record<string, unknown>;
    revenue_multiples?: { arpu_monthly: number; arpu_rationale: string; ev_revenue_multiple: number; multiple_rationale: string; growth_rate_assumption: string; scenarios: { scenario: string; year3_users: number; year3_arr: string; implied_valuation: string }[] };
    comparable_companies?: { comps: { name: string; description: string; valuation_or_multiple: string; relevance: string }[]; early_stage_discount: string; implied_range: string };
    berkus_method?: Record<string, unknown>;
    scorecard_method?: { base_valuation: string; adjustments: { factor: string; weight: number; comparison: number; rationale: string }[]; adjusted_valuation: string };
    unit_economics?: Record<string, unknown>;
    methodology_note?: string;
    risk_factors?: string[];
    upside_catalysts?: string[];
  };
  build_brief: {
    product_name: string;
    problem: string;
    solution: string;
    target_users: string;
    core_features: string[];
    mvp_scope: string[];
    suggested_tech_stack: Record<string, string>;
    basic_user_flow: string[];
    monetization_model: string;
    expansion_potential: string[];
  };
  autonomy: {
    autonomy_score: number;
    feasibility_verdict: string;
    confidence_level: number;
    capabilities: { area: string; score: number; status: string; detail: string }[];
    what_devin_can_do: string[];
    what_devin_cannot_do: string[];
    what_user_must_do: string[];
    estimated_build_time: string;
    risk_factors: string[];
    recommendation: string;
  };
  created_at: string;
}

export interface HelixaSynthesizedIdea {
  id: number;
  title: string;
  description: string;
  source_idea_ids: number[];
  source_idea_names: string[];
  concept: {
    problem: string;
    solution: string;
    target_users: string;
    product_type: string;
    monetization: string;
    unique_angle: string;
    estimated_potential: string;
  };
  status: string;
  user_comment: string;
  ai_revision: string;
  created_at: string;
}

export interface HelixaExperimentalIdea {
  id: number;
  idea_name: string;
  product_type: string;
  description: string;
  overall_score: number;
  structured_idea: Record<string, string>;
  scores: Record<string, number | string | Record<string, unknown>>;
  generation_number: number;
  learning_note: string;
  status: string;
  user_comment: string;
  created_at: string;
}

export interface HelixaExperimentalStats {
  total: number;
  avg_score: number;
  best_score: number;
  above_8_count: number;
  above_9_count: number;
  success_rate: number;
}

// ==================== PLANTER TYPES ====================

export interface PlanterSession {
  id: number;
  user_id: number;
  idea_id: number | null;
  idea_name: string;
  devin_session_id: string;
  session_url: string;
  status: string;
  title: string;
  pr_url: string;
  frontend_url: string;
  backend_url: string;
  repo_url: string;
  created_at: string;
  updated_at: string;
}

export interface PlanterSessionDetail extends PlanterSession {
  devin_data?: {
    status: string;
    status_enum: string;
    title: string;
    created_at: string;
    updated_at: string;
    pull_request: { url: string } | null;
    structured_output: Record<string, unknown> | null;
  };
}

// ==================== API ====================

export const api = {
  auth: {
    register: (email: string, password: string, full_name: string) =>
      request<AuthResponse>('/api/auth/register', { method: 'POST', body: { email, password, full_name } }),
    login: (email: string, password: string) =>
      request<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } }),
    me: () => request<User>('/api/auth/me'),
    guestAccess: (guest_token: string) =>
      request<AuthResponse>('/api/auth/guest-access', { method: 'POST', body: { guest_token } }),
  },
  credentials: {
    status: () => request<CredentialStatus[]>('/api/credentials/status'),
    save: (credential_type: string, credential_data: Record<string, string>) =>
      request<{ message: string }>('/api/credentials', { method: 'POST', body: { credential_type, credential_data } }),
    validate: (credential_type: string) =>
      request<{ valid: boolean; message: string }>(`/api/credentials/${credential_type}/validate`, { method: 'POST' }),
    autoGenerate: (credential_type: string) =>
      request<{ message: string; generated: boolean; details: Record<string, string> }>(`/api/credentials/${credential_type}/auto-generate`, { method: 'POST' }),
  },
  projects: {
    list: () => request<Project[]>('/api/projects'),
    get: (id: number) => request<Project>(`/api/projects/${id}`),
    create: (data: { name: string; bundle_id?: string; github_repo?: string; platform?: string }) =>
      request<Project>('/api/projects', { method: 'POST', body: data }),
    update: (id: number, data: Partial<Project>) =>
      request<Project>(`/api/projects/${id}`, { method: 'PUT', body: data }),
    delete: (id: number, password: string) =>
      request<{ message: string }>(`/api/projects/${id}/delete`, { method: 'POST', body: { password } }),
  },
  questionnaire: {
    questions: () => request<QuestionnaireQuestion[]>('/api/questionnaire/questions'),
    submit: (projectId: number, answers: Array<{ question_key: string; answer_text: string }>) =>
      request<{ message: string }>(`/api/projects/${projectId}/questionnaire`, { method: 'POST', body: { answers } }),
    get: (projectId: number) => request<Record<string, string>>(`/api/projects/${projectId}/questionnaire`),
  },
  generate: {
    listing: (projectId: number) =>
      request<GenerateResult>(`/api/projects/${projectId}/generate`, { method: 'POST' }),
    localization: (projectId: number, language: string) =>
      request<{ message: string; data: Record<string, string> }>(`/api/projects/${projectId}/generate-localization?language=${language}`, { method: 'POST' }),
    growthIdeas: (projectId: number) =>
      request<Record<string, unknown>>(`/api/projects/${projectId}/growth-ideas`, { method: 'POST' }),
  },
  listings: {
    get: (projectId: number) => request<StoreListing[]>(`/api/projects/${projectId}/listings`),
    update: (listingId: number, data: Partial<StoreListing>) =>
      request<StoreListing>(`/api/listings/${listingId}`, { method: 'PUT', body: data }),
  },
  strategy: {
    generate: (projectId: number) =>
      request<{ message: string; launch_strategy: Record<string, unknown>; monetization: Record<string, unknown>; metrics_plan: Record<string, unknown>; common_mistakes: Array<Record<string, unknown>>; screenshot_tips: string[]; onboarding_tips: string[]; tokens_used: number }>(`/api/projects/${projectId}/strategy/generate`, { method: 'POST' }),
    get: (projectId: number) =>
      request<{ exists: boolean; launch_strategy?: Record<string, unknown>; monetization?: Record<string, unknown>; metrics_plan?: Record<string, unknown>; common_mistakes?: Array<Record<string, unknown>>; screenshot_tips?: string[]; onboarding_tips?: string[]; tokens_used?: number }>(`/api/projects/${projectId}/strategy`),
  },
  campaign: {
    generate: (projectId: number, contentType: string) =>
      request<{ message: string; content: Record<string, unknown> }>(`/api/projects/${projectId}/campaign/${contentType}`, { method: 'POST' }),
    getAll: (projectId: number) =>
      request<{ content: Record<string, { data: Record<string, unknown>; tokens_used: number; updated_at: string }> }>(`/api/projects/${projectId}/campaign`),
  },
  pipeline: {
    start: (projectId: number) =>
      request<{ message: string; run_id: number }>(`/api/projects/${projectId}/pipeline/start`, { method: 'POST' }),
    get: (projectId: number) =>
      request<{ run: PipelineRun | null; r_factor: RFactor | null }>(`/api/projects/${projectId}/pipeline`),
    getRun: (runId: number) => request<PipelineRun>(`/api/pipeline/${runId}`),
    reset: (projectId: number) =>
      request<{ message: string }>(`/api/projects/${projectId}/pipeline/reset`, { method: 'POST' }),
  },
  dashboard: {
    get: () => request<DashboardData>('/api/dashboard'),
  },
  settings: {
    get: () => request<Record<string, string>>('/api/settings'),
    update: (key: string, value: string) =>
      request<{ message: string }>('/api/settings', { method: 'POST', body: { key, value } }),
  },
  feedback: {
    submit: (credential_type: string, message: string, screenshot_base64: string) =>
      request<{ message: string; ai_suggestion: { diagnosis: string; solution: string[]; alternative: string; helpful_link: string; helpful_link_label: string } | null }>('/api/setup-feedback', { method: 'POST', body: { credential_type, message, screenshot_base64 } }),
    list: () =>
      request<Array<{ id: number; credential_type: string; message: string; screenshot_base64: string; status: string; created_at: string }>>('/api/setup-feedback'),
  },
  helixa: {
    ideas: {
      list: () => request<HelixaIdeaSummary[]>('/api/helixa/ideas'),
      get: (id: number) => request<HelixaIdea>(`/api/helixa/ideas/${id}`),
      process: (text: string) => request<HelixaIdea>('/api/helixa/process', { method: 'POST', body: { text } }),
      delete: (id: number) => request<{ message: string }>(`/api/helixa/ideas/${id}`, { method: 'DELETE' }),
      createApp: (id: number) => request<{ message: string; project_id: number }>(`/api/helixa/ideas/${id}/create-app`, { method: 'POST' }),
    },
    transcribe: async (file: Blob) => {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file, 'audio.webm');
      const res = await fetch(`${API_URL}/api/helixa/transcribe`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Transcription failed');
      return res.json() as Promise<{ text: string }>;
    },
    synthesized: {
      list: () => request<HelixaSynthesizedIdea[]>('/api/helixa/synthesized'),
      generate: () => request<{ synthesized: HelixaSynthesizedIdea[] }>('/api/helixa/synthesize', { method: 'POST' }),
      feedback: (id: number, status: string, comment: string = '') =>
        request<{ message: string }>(`/api/helixa/synthesized/${id}/feedback`, { method: 'PUT', body: { status, comment } }),
      delete: (id: number) => request<{ message: string }>(`/api/helixa/synthesized/${id}`, { method: 'DELETE' }),
    },
    experimental: {
      list: () => request<HelixaExperimentalIdea[]>('/api/helixa/experimental'),
      generate: () => request<HelixaExperimentalIdea>('/api/helixa/experimental/generate', { method: 'POST' }),
      stats: () => request<HelixaExperimentalStats>('/api/helixa/experimental/stats'),
      feedback: (id: number, status: string, comment: string = '') =>
        request<{ message: string }>(`/api/helixa/experimental/${id}/feedback`, { method: 'PUT', body: { status, comment } }),
      delete: (id: number) => request<{ message: string }>(`/api/helixa/experimental/${id}`, { method: 'DELETE' }),
    },
    importData: () => request<{ message: string; imported: { ideas: number; synthesized: number; experimental: number } }>('/api/helixa/import', { method: 'POST' }),
  },
  planter: {
    build: (data: { idea_id?: number; idea_name: string; idea_description?: string; custom_prompt?: string }) =>
      request<{ session_id: string; session_url: string; status: string; message: string }>('/api/planter/build', { method: 'POST', body: data }),
    sessions: () => request<PlanterSession[]>('/api/planter/sessions'),
    getSession: (sessionId: string) => request<PlanterSessionDetail>(`/api/planter/session/${sessionId}`),
    sendMessage: (sessionId: string, message: string) =>
      request<Record<string, unknown>>(`/api/planter/session/${sessionId}/message`, { method: 'POST', body: { message } }),
  },
};
