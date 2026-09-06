"use client";

import React, { useState } from "react";
import { AlertTriangle, Server, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComfyUIService } from "@/services/frontend/comfyui";

export function ConnectionBanner({ isConnected, serverUrl, onRetry, isLoading }) {
  const [isStarting, setIsStarting] = useState(false);

  if (isConnected) return null;

  const handleStartComfy = async () => {
    setIsStarting(true);
    try {
      await ComfyUIService.startServer();
      setTimeout(() => {
        onRetry?.();
        setIsStarting(false);
      }, 3500);
    } catch {
      setIsStarting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-amber-300">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/20 p-2 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-amber-200">
              Cannot reach ComfyUI Server ({serverUrl})
            </h4>
            <p className="text-[11px] text-amber-300/80">
              Ensure ComfyUI is running locally or check that your server endpoint is correct in Settings.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={handleStartComfy}
            disabled={isStarting}
            className="bg-amber-600 hover:bg-amber-500 text-white border-none text-xs h-8"
          >
            <Server className="mr-1.5 h-3.5 w-3.5" />
            {isStarting ? "Starting..." : "Start ComfyUI"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={isLoading}
            className="border-amber-500/30 text-amber-200 hover:bg-amber-500/20 text-xs h-8"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
