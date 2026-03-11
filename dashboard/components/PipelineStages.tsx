"use client";

import { PIPELINE_STAGES, type PipelineStage } from "@/lib/types";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { clsx } from "clsx";

interface PipelineStagesProps {
  currentStage: PipelineStage;
  status: string;
}

export function PipelineStages({ currentStage, status }: PipelineStagesProps) {
  const currentIdx = PIPELINE_STAGES.indexOf(currentStage);

  return (
    <div className="w-full">
      <div className="relative flex items-start justify-between gap-1">
        {PIPELINE_STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIdx || status === "completed";
          const isCurrent = idx === currentIdx && status !== "completed";
          const isFailed = isCurrent && status === "failed";

          return (
            <div key={stage} className="flex flex-col items-center flex-1 min-w-0">
              {/* Connector line */}
              <div className="relative flex items-center w-full">
                {idx > 0 && (
                  <div
                    className={clsx(
                      "absolute left-0 right-1/2 h-0.5 -translate-x-0",
                      isCompleted || isCurrent
                        ? "bg-primary"
                        : "bg-border"
                    )}
                  />
                )}
                {idx < PIPELINE_STAGES.length - 1 && (
                  <div
                    className={clsx(
                      "absolute left-1/2 right-0 h-0.5",
                      isCompleted ? "bg-primary" : "bg-border"
                    )}
                  />
                )}

                {/* Icon */}
                <div className="relative z-10 mx-auto">
                  {isFailed ? (
                    <XCircle size={20} className="text-red-500" />
                  ) : isCompleted ? (
                    <CheckCircle2 size={20} className="text-primary" />
                  ) : isCurrent ? (
                    <Loader2 size={20} className="text-primary animate-spin" />
                  ) : (
                    <Circle size={20} className="text-muted-foreground/40" />
                  )}
                </div>
              </div>

              {/* Label */}
              <span
                className={clsx(
                  "mt-2 text-[10px] text-center leading-tight break-all",
                  isCurrent ? "text-primary font-semibold" : isCompleted ? "text-foreground" : "text-muted-foreground/50"
                )}
              >
                {stage.replace("_", "\u200b_")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
