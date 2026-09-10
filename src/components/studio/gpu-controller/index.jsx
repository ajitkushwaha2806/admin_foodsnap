"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EC2Service } from "@/services/frontend/ec2";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Cpu,
  Power,
  RefreshCw,
  Server,
  CheckCircle2,
  AlertTriangle,
  Flame,
  PauseCircle,
  PlayCircle,
  ExternalLink,
} from "lucide-react";

export function GpuController({ onIpUpdated }) {
  const queryClient = useQueryClient();
  const [isConfirmStopOpen, setIsConfirmStopOpen] = useState(false);
  const [isConfirmStartOpen, setIsConfirmStartOpen] = useState(false);

  // Poll instance status every 5 seconds if pending/stopping, else every 15 seconds
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ec2-status"],
    queryFn: () => EC2Service.getInstanceStatus(),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === "pending" || state === "stopping") return 3000;
      return 15000;
    },
  });

  const state = data?.state || "unknown";
  const publicIp = data?.publicIp;
  const comfyUrl = data?.comfyUrl;
  const isRunning = state === "running";
  const isPending = state === "pending";
  const isStopping = state === "stopping";
  const isStopped = state === "stopped";

  // Notify parent if IP changed
  useEffect(() => {
    if (isRunning && publicIp && onIpUpdated) {
      onIpUpdated(publicIp, comfyUrl);
    }
  }, [isRunning, publicIp, comfyUrl, onIpUpdated]);

  // Start Mutation
  const startMutation = useMutation({
    mutationFn: () => EC2Service.startInstance(),
    onSuccess: () => {
      toast.info("Starting AWS EC2 GPU instance... Ready in ~30s");
      setIsConfirmStartOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ec2-status"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to start EC2 instance");
    },
  });

  // Stop Mutation
  const stopMutation = useMutation({
    mutationFn: () => EC2Service.stopInstance(),
    onSuccess: () => {
      toast.success("Stopping AWS EC2 GPU instance. Billing paused!");
      setIsConfirmStopOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ec2-status"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to stop EC2 instance");
    },
  });

  const getStateBadge = () => {
    if (isRunning) {
      return (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      );
    }
    if (isPending || isStopping) {
      return <RefreshCw className="h-2.5 w-2.5 text-amber-400 animate-spin" />;
    }
    return <span className="inline-flex rounded-full h-2 w-2 bg-rose-500/80"></span>;
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-9 px-3 text-xs gap-2 border transition-all ${
              isRunning
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : isPending || isStopping
                ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            }`}
          >
            {getStateBadge()}
            <Cpu className="h-3.5 w-3.5 opacity-80" />
            <span className="font-semibold uppercase text-[11px] tracking-wider">
              {isRunning ? "GPU ON" : isPending ? "STARTING..." : isStopping ? "STOPPING..." : "GPU OFF"}
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-80 p-4 space-y-3" align="end">
          <div className="flex items-center justify-between border-b pb-2.5">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-orange-500" />
              <h4 className="font-semibold text-xs">AWS EC2 GPU Manager</h4>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider ${
                isRunning
                  ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                  : isPending || isStopping
                  ? "border-amber-500 text-amber-400 bg-amber-500/10"
                  : "border-rose-500 text-rose-400 bg-rose-500/10"
              }`}
            >
              {state}
            </Badge>
          </div>

          {/* Details */}
          <div className="space-y-1.5 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border">
            <div className="flex justify-between">
              <span>Instance:</span>
              <span className="font-mono text-foreground">{data?.instanceId || "i-072a8587c036011dd"}</span>
            </div>
            <div className="flex justify-between">
              <span>Hardware:</span>
              <span className="text-foreground font-medium">NVIDIA Tesla T4 (16GB)</span>
            </div>
            {publicIp && (
              <div className="flex justify-between items-center">
                <span>Public IP:</span>
                <span className="font-mono text-foreground font-semibold">{publicIp}</span>
              </div>
            )}
            {comfyUrl && isRunning && (
              <div className="flex justify-between items-center pt-1 border-t">
                <span>ComfyUI GUI:</span>
                <a
                  href={comfyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-400 hover:underline inline-flex items-center gap-1 text-[11px]"
                >
                  Open Web GUI <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {isRunning ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setIsConfirmStopOpen(true)}
                disabled={stopMutation.isPending}
                className="w-full text-xs h-8 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                {stopMutation.isPending ? "Stopping GPU..." : "Pause / Stop GPU"}
              </Button>
            ) : isStopped ? (
              <Button
                size="sm"
                onClick={() => setIsConfirmStartOpen(true)}
                disabled={startMutation.isPending}
                className="w-full text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                {startMutation.isPending ? "Starting GPU..." : "Power ON GPU"}
              </Button>
            ) : (
              <Button size="sm" disabled className="w-full text-xs h-8 gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {isPending ? "Starting Instance..." : "Stopping Instance..."}
              </Button>
            )}

            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Confirmation Dialog: Stop Instance */}
      <Dialog open={isConfirmStopOpen} onOpenChange={setIsConfirmStopOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
              <DialogTitle>Pause / Stop GPU Instance?</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-xs text-muted-foreground leading-relaxed">
              Stopping the EC2 instance (<code>{data?.instanceId}</code>) will pause AWS GPU billing immediately.
              <br /><br />
              Any active generations in progress will halt. You can power it back on at any time with 1 click.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmStopOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {stopMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <Power className="w-3.5 h-3.5" />
                  Yes, Pause & Stop GPU
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Start Instance */}
      <Dialog open={isConfirmStartOpen} onOpenChange={setIsConfirmStartOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-500">
              <PlayCircle className="w-5 h-5" />
              <DialogTitle>Power ON GPU Instance?</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-xs text-muted-foreground leading-relaxed">
              This will boot your AWS EC2 NVIDIA Tesla T4 instance. It takes about <strong>~30 seconds</strong> to initialize and auto-connect ComfyUI.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmStartOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {startMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Booting...
                </>
              ) : (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  Start GPU Instance
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GpuController;
