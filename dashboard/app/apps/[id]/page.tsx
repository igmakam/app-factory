import { Suspense } from "react";
import { fetchApp, fetchAppLogs } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { PipelineStages } from "@/components/PipelineStages";
import type { App, LogEntry } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

const MOCK_APP: App = {
  id: "mock",
  name: "Workout Tracker AI",
  idea: "A workout tracker with AI coaching that adapts to your fitness level",
  platform: "ios",
  status: "running",
  current_stage: "codegen",
  created_at: new Date(Date.now() - 3600000).toISOString(),
  updated_at: new Date(Date.now() - 600000).toISOString(),
};

const MOCK_LOGS: LogEntry[] = [
  {
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    level: "info",
    stage: "idea",
    message: "App idea received and queued for processing",
  },
  {
    timestamp: new Date(Date.now() - 3500000).toISOString(),
    level: "info",
    stage: "validation",
    message: "Validating app concept against market data...",
  },
  {
    timestamp: new Date(Date.now() - 3400000).toISOString(),
    level: "info",
    stage: "validation",
    message: "Validation passed. App concept is viable.",
  },
  {
    timestamp: new Date(Date.now() - 3200000).toISOString(),
    level: "info",
    stage: "planning",
    message: "Generating feature roadmap and technical spec...",
  },
  {
    timestamp: new Date(Date.now() - 3000000).toISOString(),
    level: "info",
    stage: "listing",
    message: "Creating App Store listing content...",
  },
  {
    timestamp: new Date(Date.now() - 2800000).toISOString(),
    level: "info",
    stage: "codegen",
    message: "Starting code generation for iOS target...",
  },
  {
    timestamp: new Date(Date.now() - 600000).toISOString(),
    level: "info",
    stage: "codegen",
    message: "Generated 24 Swift files, 8 SwiftUI views",
  },
];

async function AppDetailContent({ id }: { id: string }) {
  let app: App;
  let logs: LogEntry[];

  try {
    [app, logs] = await Promise.all([fetchApp(id), fetchAppLogs(id)]);
  } catch {
    app = { ...MOCK_APP, id };
    logs = MOCK_LOGS;
  }

  const logLevelColors: Record<string, string> = {
    info: "text-blue-400",
    debug: "text-muted-foreground",
    warning: "text-yellow-400",
    error: "text-red-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/apps"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {app.name ?? `App #${app.id}`}
            </h1>
            <StatusBadge status={app.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {app.platform} · Created {new Date(app.created_at).toLocaleString()}
          </p>
        </div>
        <Link
          href={`/apps/${id}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </Link>
      </div>

      {/* Idea */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">App Idea</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {app.idea}
          </p>
        </CardContent>
      </Card>

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pipeline Progress
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              Current stage: <span className="text-primary font-medium">{app.current_stage}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-6">
          <PipelineStages
            currentStage={app.current_stage}
            status={app.status}
          />
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black/40 rounded-md border border-border p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">No log entries yet…</p>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="text-muted-foreground/50 shrink-0 select-none">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  {entry.stage && (
                    <span className="text-purple-400 shrink-0 min-w-[80px]">
                      [{entry.stage}]
                    </span>
                  )}
                  <span
                    className={
                      logLevelColors[entry.level] ?? "text-foreground"
                    }
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Meta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">App ID</dt>
              <dd className="font-mono text-xs mt-0.5">{app.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Platform</dt>
              <dd className="capitalize mt-0.5">{app.platform}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="mt-0.5">
                {new Date(app.created_at).toLocaleString()}
              </dd>
            </div>
            {app.updated_at && (
              <div>
                <dt className="text-muted-foreground">Last Updated</dt>
                <dd className="mt-0.5">
                  {new Date(app.updated_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AppDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading app…
        </div>
      }
    >
      <AppDetailContent id={params.id} />
    </Suspense>
  );
}
