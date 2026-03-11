import { Suspense } from "react";
import { fetchApps } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { AppsFilters } from "@/components/AppsFilters";
import type { App } from "@/lib/types";
import Link from "next/link";
import { AppWindow, PlusCircle } from "lucide-react";

const MOCK_APPS: App[] = [
  {
    id: "1",
    name: "Workout Tracker AI",
    idea: "A workout tracker with AI coaching that adapts to your fitness level",
    platform: "ios",
    status: "completed",
    current_stage: "done",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "2",
    name: "Recipe Manager",
    idea: "Recipe manager with meal planning and grocery list generation",
    platform: "android",
    status: "running",
    current_stage: "codegen",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "3",
    name: "Budget Tracker",
    idea: "Budget tracker with smart insights and spending predictions",
    platform: "both",
    status: "failed",
    current_stage: "testing",
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "4",
    name: "Sleep Monitor",
    idea: "Sleep monitoring app with smart alarm and sleep score analytics",
    platform: "ios",
    status: "queued",
    current_stage: "idea",
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "5",
    name: "Language Learner",
    idea: "Language learning app with spaced repetition and AI conversations",
    platform: "both",
    status: "pending",
    current_stage: "idea",
    created_at: new Date(Date.now() - 900000).toISOString(),
  },
];

async function AppsListContent({ status }: { status?: string }) {
  let apps: App[];
  try {
    apps = await fetchApps(status);
  } catch {
    apps = status
      ? MOCK_APPS.filter((a) => a.status === status)
      : MOCK_APPS;
  }

  return (
    <div className="space-y-3">
      {apps.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No apps found{status ? ` with status "${status}"` : ""}.</p>
          <Link href="/apps/new" className="text-primary hover:underline mt-2 block">
            Create your first app →
          </Link>
        </div>
      ) : (
        apps.map((app: App) => (
          <Link
            key={app.id}
            href={`/apps/${app.id}`}
            className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent transition-colors block"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <p className="font-medium text-sm">{app.name ?? `App #${app.id}`}</p>
                <StatusBadge status={app.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate max-w-lg">
                {app.idea}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {app.platform} · Stage: <span className="text-foreground/70">{app.current_stage}</span>
                {" · "}
                {new Date(app.created_at).toLocaleDateString()}
              </p>
            </div>
            <span className="text-muted-foreground/50 ml-4 text-lg">→</span>
          </Link>
        ))
      )}
    </div>
  );
}

export default function AppsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams?.status;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AppWindow size={24} /> All Apps
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage and monitor all your generated apps
          </p>
        </div>
        <Link
          href="/apps/new"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <PlusCircle size={16} /> New App
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Apps</span>
            <AppsFilters currentStatus={status} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="py-12 text-center text-muted-foreground">
                Loading apps…
              </div>
            }
          >
            <AppsListContent status={status} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
