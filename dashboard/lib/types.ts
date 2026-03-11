export type PipelineStage =
  | "idea"
  | "validation"
  | "planning"
  | "listing"
  | "codegen"
  | "analysis"
  | "testing"
  | "build"
  | "store_submit"
  | "done";

export const PIPELINE_STAGES: PipelineStage[] = [
  "idea",
  "validation",
  "planning",
  "listing",
  "codegen",
  "analysis",
  "testing",
  "build",
  "store_submit",
  "done",
];

export type AppStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "queued";

export interface App {
  id: string;
  name?: string;
  idea: string;
  platform: "ios" | "android" | "both";
  status: AppStatus;
  current_stage: PipelineStage;
  created_at: string;
  updated_at?: string;
}

export interface Notification {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface DashboardData {
  total_apps: number;
  status_breakdown: Record<string, number>;
  recent_apps: App[];
  unread_notifications: number;
  notifications: Notification[];
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
  stage?: string;
}
