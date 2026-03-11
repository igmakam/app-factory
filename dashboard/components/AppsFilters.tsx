"use client";

import { useRouter, usePathname } from "next/navigation";

const STATUSES = ["all", "pending", "queued", "running", "completed", "failed"];

export function AppsFilters({ currentStatus }: { currentStatus?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(status: string) {
    if (status === "all") {
      router.push(pathname);
    } else {
      router.push(`${pathname}?status=${status}`);
    }
  }

  const active = currentStatus ?? "all";

  return (
    <div className="flex gap-1 flex-wrap">
      {STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => handleChange(s)}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            active === s
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
