"use client";

import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@/lib/types";

const statusConfig: Record<
  AppStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  queued: {
    label: "Queued",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  running: {
    label: "Running",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  completed: {
    label: "Completed",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

export function StatusBadge({ status }: { status: AppStatus }) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
