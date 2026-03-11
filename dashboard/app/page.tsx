import { Suspense } from "react";
import { fetchDashboard } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { DashboardCharts } from "@/components/DashboardCharts";
import Link from "next/link";
import type { App, DashboardData } from "@/lib/types";
import { Bell, LayoutDashboard, PlusCircle } from "lucide-react";

const MOCK_DATA: DashboardData = {
  total_apps: 12,
  status_breakdown: {
    completed: 7,
    running: 2,
    failed: 1,
    pending: 1,
    queued: 1,
  },
  recent_apps: [
    {
      id: "1",
      idea: "A workout tracker with AI coaching",
      platform: "ios",
      status: "completed",
      current_stage: "done",
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "2",
      idea: "Recipe manager with meal planning",
      platform: "android",
      status: "running",
      current_stage: "codegen",
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "3",
      idea: "Budget tracker with smart insights",
      platform: "both",
      status: "failed",
      current_stage: "testing",
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
  ],
  unread_notifications: 3,
  notifications: [
    {
      id: "n1",
      message: "App 'Workout Tracker' completed successfully",
      read: false,
      created_at: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: "n2",
      message: "App 'Budget Tracker' failed at testing stage",
      read: false,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "n3",
      message: "New app submission received",
      read: false,
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
  ],
};

async function DashboardContent() {
  let data: DashboardData;
  try {
    data = await fetchDashboard();
  } catch {
    data = MOCK_DATA;
  }

  const statusColors: Record<string, string> = {
    completed: "#22c55e",
    running: "#10b981",
    failed: "#ef4444",
    pending: "#eab308",
    queued: "#3b82f6",
  };

  const chartData = Object.entries(data.status_breakdown).map(
    ([name, value]) => ({
      name,
      value,
      fill: statusColors[name] ?? "#6b7280",
    })
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard size={24} /> Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Overview of your App Factory pipeline
          </p>
        </div>
        <Link
          href="/apps/new"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <PlusCircle size={16} /> New App
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Apps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.total_apps}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">
              {data.status_breakdown.completed ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Running
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">
              {data.status_breakdown.running ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bell size={14} /> Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">
              {data.unread_notifications}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts + Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardCharts data={chartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell size={16} /> Recent Notifications
              {data.unread_notifications > 0 && (
                <Badge className="bg-blue-500 text-white text-xs">
                  {data.unread_notifications} new
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data.notifications ?? []).slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  className={`text-sm p-2 rounded-md border ${
                    !n.read
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <p className={!n.read ? "font-medium" : "text-muted-foreground"}>
                    {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
              {(!data.notifications || data.notifications.length === 0) && (
                <p className="text-muted-foreground text-sm">No notifications</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Apps */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Apps</CardTitle>
          <Link
            href="/apps"
            className="text-sm text-primary hover:underline"
          >
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.recent_apps.map((app: App) => (
              <Link
                key={app.id}
                href={`/apps/${app.id}`}
                className="flex items-center justify-between p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {app.name ?? app.idea}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {app.platform} · {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {app.current_stage}
                  </span>
                  <StatusBadge status={app.status} />
                </div>
              </Link>
            ))}
            {data.recent_apps.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">
                No apps yet.{" "}
                <Link href="/apps/new" className="text-primary underline">
                  Create one →
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading dashboard…
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
