"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PlusCircle size={24} /> New App
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Describe your app idea and let the factory build it
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">App Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Idea */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                App Idea <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="Describe your app idea in detail. Be specific about features, target audience, and unique value proposition..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={6}
                className="resize-none"
                required
              />
              <p className="text-xs text-muted-foreground">
                {idea.length} characters · The more detail, the better the output
              </p>
            </div>

            {/* Platform */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform</label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ios">iOS only</SelectItem>
                  <SelectItem value="android">Android only</SelectItem>
                  <SelectItem value="both">iOS + Android</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Target platform for App Store / Google Play submission
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading || !idea.trim()}
                className="min-w-32"
              >
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
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Pipeline preview */}
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
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {stage}
                </span>
                {i < arr.length - 1 && (
                  <span className="text-muted-foreground/40 text-xs">→</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Your idea will be validated, planned, and turned into a fully
            built & submitted mobile app automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
