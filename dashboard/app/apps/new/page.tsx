"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function NewAppPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState("both");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), platform }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      router.push(`/apps/${data.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create app";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <PlusCircle size={24} /> New App
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your app idea and let the factory build it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">App Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="idea" className="text-sm font-medium">
                App Idea <span className="text-red-500">*</span>
              </label>
              <Textarea
                id="idea"
                placeholder="Describe your app idea in detail. Be specific about features, target audience, and unique value proposition..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={6}
                className="resize-none"
                required
              />
              <p className="text-xs text-muted-foreground">
                {idea.length} characters · The more detail, the better the output.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="platform" className="text-sm font-medium">
                Platform
              </label>
              <select
                id="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ios">iOS only</option>
                <option value="android">Android only</option>
                <option value="both">iOS + Android</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Target platform for App Store / Google Play submission.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={loading || !idea.trim()} className="min-w-32">
                {loading ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <PlusCircle size={16} className="mr-2" />
                    Create App
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => router.back()}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What happens next?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
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
            ].map((stage, i, arr) => (
              <div key={stage} className="flex items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {stage}
                </span>
                {i < arr.length - 1 && <span className="text-xs text-muted-foreground/40">→</span>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Your idea will be validated, planned, and turned into a built and submitted mobile app automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
