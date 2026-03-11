const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchDashboard() {
  const res = await fetch(`${API_URL}/api/dashboard`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch dashboard");
  return res.json();
}

export async function fetchApps(status?: string) {
  const url = status
    ? `${API_URL}/api/apps?status=${encodeURIComponent(status)}`
    : `${API_URL}/api/apps`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch apps");
  return res.json();
}

export async function fetchApp(id: string) {
  const res = await fetch(`${API_URL}/api/apps/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch app");
  return res.json();
}

export async function fetchAppLogs(id: string) {
  const res = await fetch(`${API_URL}/api/apps/${id}/logs`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

export async function createApp(data: {
  idea: string;
  platform: string;
}) {
  const res = await fetch(`${API_URL}/api/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create app");
  return res.json();
}
