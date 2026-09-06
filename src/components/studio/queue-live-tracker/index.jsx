"use client";

import React, { useState } from "react";
import { Play, Square, Loader2, Sparkles, CheckCircle2, Clock, Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";

export function QueueLiveTracker({
  items,
  background,
  isProcessing,
  onStartProcessing,
  onCancelProcessing,
  completedCount,
  totalCount,
  elapsedTime,
  logs,
}) {
  const [showLogs, setShowLogs] = useState(false);

  const activeItem = items.find((item) => item.status === "processing" || item.status === "uploading" || item.status === "queued");
  const overallPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const canStart = items.length > 0 && background.file && !isProcessing;

  return (
    <Card className="p-5 shadow-md border bg-card">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold">AI Batch Workflow Execution</h2>
            {isProcessing ? (
              <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 animate-pulse text-[10px]">
                <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" /> In Progress
              </Badge>
            ) : completedCount > 0 && completedCount === totalCount ? (
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Complete
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Ready</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Transforms each dish image onto the chosen background via Flux.2 Klein 4B Distilled and uploads to S3 + Image model.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {!isProcessing ? (
            <Button
              size="default"
              disabled={!canStart}
              onClick={onStartProcessing}
              className="w-full sm:w-auto bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-medium text-xs h-9 px-4 shadow-sm"
            >
              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
              Transform {items.length} {items.length === 1 ? "Dish" : "Dishes"}
            </Button>
          ) : (
            <Button
              size="default"
              variant="destructive"
              onClick={onCancelProcessing}
              className="w-full sm:w-auto text-xs h-9"
            >
              <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
              Stop Batch
            </Button>
          )}
        </div>
      </div>

      {/* Progress & Real-Time Node Status */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Overall Progress */}
        <div className="rounded-xl border bg-muted/30 p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Overall Batch Progress</span>
            <span className="font-mono font-medium text-foreground">{completedCount} of {totalCount} done ({overallPercent}%)</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-300 ease-out"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>

        {/* Current Active Item & Step */}
        <div className="rounded-xl border bg-muted/30 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Active Node Status</span>
            {activeItem && (
              <span className="font-mono text-xs text-orange-500 font-bold">
                {activeItem.progress || 0}%
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {isProcessing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500 shrink-0" />
                <span className="text-xs font-semibold truncate">
                  {activeItem?.currentNodeName || "Starting workflow..."}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Idle / Ready to start</span>
            )}
          </div>
        </div>

        {/* Execution Timer */}
        <div className="rounded-xl border bg-muted/30 p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Elapsed Time</p>
            <p className="text-base font-mono font-bold mt-0.5">
              {formatDuration(elapsedTime)}
            </p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Clock className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Live Console Logs Toggle */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>Live Execution Logs ({logs.length})</span>
          {showLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showLogs && (
          <div className="mt-2 rounded-xl border bg-black/90 p-3 font-mono text-[11px] text-zinc-300 max-h-36 overflow-y-auto space-y-1">
            {logs.length === 0 ? (
              <p className="text-zinc-600">No logs generated yet...</p>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="leading-tight">
                  <span className="text-zinc-600 select-none">[{idx + 1}] </span>
                  <span className={log.includes("Error") || log.includes("✕") ? "text-rose-400" : log.includes("✓") ? "text-emerald-400" : "text-zinc-300"}>
                    {log}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
