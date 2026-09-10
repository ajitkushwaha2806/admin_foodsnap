"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getJobs,
  retryJob,
  deleteJob,
  deleteSelectedJobs,
  purgeDuplicateJobs,
  performQueueAction,
} from "@/services/frontend/jobs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  RotateCcw,
  ExternalLink,
  Zap,
  Activity,
  Server,
  Image as ImageIcon,
  Download,
  Eye,
  Cpu,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  ZoomIn,
  CopyX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import { EC2Service } from "@/services/frontend/ec2";
import { ImageCompareModal } from "@/components/studio/image-compare-modal";

export default function QueueDashboardPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDuplicateOnly, setFilterDuplicateOnly] = useState(false);
  const [filterBadImageOnly, setFilterBadImageOnly] = useState(false);

  // Selection state
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Modals
  const [selectedJob, setSelectedJob] = useState(null);
  const [inspectImageItem, setInspectImageItem] = useState(null);
  const [compareModalItem, setCompareModalItem] = useState(null);

  const queryClient = useQueryClient();

  const handleDownloadSingle = async (url, dishName) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, `foodsnap-${(dishName || "dish").replace(/[/\\?%*:|"<>]/g, "_")}.png`);
      toast.success(`Downloaded ${dishName}`);
    } catch {
      toast.error("Download failed");
    }
  };

  // Query jobs and stats with 3-second polling
  const {
    data: queueData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["bullmq-jobs", { status: activeTab, page, limit: pageSize }],
    queryFn: () => getJobs({ status: activeTab, page, limit: pageSize }),
    refetchInterval: 3000,
  });

  // Query EC2 GPU Fleet Status (All 3 instances)
  const { data: fleetData, isFetching: isFetchingFleet, refetch: refetchFleet } = useQuery({
    queryKey: ["ec2-fleet-status"],
    queryFn: () => EC2Service.getFleetStatus(),
    refetchInterval: 8000,
  });

  const fleetInstances = fleetData?.instances || [];
  const runningGpuCount = fleetData?.runningCount || 0;
  const totalGpuCount = fleetData?.totalCount || fleetInstances.length || 3;

  // GPU Mutations
  const toggleGpuMutation = useMutation({
    mutationFn: async ({ instanceId, action }) => {
      if (action === "start") {
        return await EC2Service.startInstance(instanceId);
      } else {
        return await EC2Service.stopInstance(instanceId);
      }
    },
    onSuccess: (data, vars) => {
      toast.success(`GPU instance ${vars.action === "start" ? "booting up" : "stopping"}...`);
      queryClient.invalidateQueries({ queryKey: ["ec2-fleet-status"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Failed to change GPU state");
    },
  });

  const startAllFleetMutation = useMutation({
    mutationFn: () => EC2Service.startAllInstances(),
    onSuccess: () => {
      toast.success("Starting all GPU instances in fleet...");
      queryClient.invalidateQueries({ queryKey: ["ec2-fleet-status"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Failed to start fleet");
    },
  });

  const stopAllFleetMutation = useMutation({
    mutationFn: () => EC2Service.stopAllInstances(),
    onSuccess: () => {
      toast.success("Stopping all GPU instances in fleet...");
      queryClient.invalidateQueries({ queryKey: ["ec2-fleet-status"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Failed to stop fleet");
    },
  });

  const stats = queueData?.stats || {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    paused: 0,
    total: 0,
    isPaused: false,
  };

  const rawJobs = useMemo(() => queueData?.jobs || [], [queueData?.jobs]);
  const totalCount = queueData?.totalCount ?? stats.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Analyze duplicates in currently returned list
  const duplicateInfo = useMemo(() => {
    const urlMap = new Map();
    const nameMap = new Map();

    rawJobs.forEach((job) => {
      const url = (job.data?.image_url || job.data?.originalUrl || job.data?.fileUrl || "").trim();
      const name = (job.data?.name || job.data?.title || "").trim().toLowerCase();

      if (url) {
        urlMap.set(url, (urlMap.get(url) || 0) + 1);
      }
      if (name) {
        nameMap.set(name, (nameMap.get(name) || 0) + 1);
      }
    });

    const duplicateJobIds = new Set();
    const seenUrls = new Set();
    const seenNames = new Set();

    rawJobs.forEach((job) => {
      const url = (job.data?.image_url || job.data?.originalUrl || job.data?.fileUrl || "").trim();
      const name = (job.data?.name || job.data?.title || "").trim().toLowerCase();

      const urlDup = url && urlMap.get(url) > 1;
      const nameDup = name && nameMap.get(name) > 1;

      if (urlDup || nameDup) {
        // Check if this is a redundant copy (already seen earlier)
        const isRedundant = (url && seenUrls.has(url)) || (name && seenNames.has(name));
        if (isRedundant) {
          duplicateJobIds.add(job.id);
        }
        if (url) seenUrls.add(url);
        if (name) seenNames.add(name);
      }
    });

    return {
      urlMap,
      nameMap,
      duplicateJobIds,
    };
  }, [rawJobs]);

  // Filtered jobs for display
  const displayedJobs = useMemo(() => {
    return rawJobs.filter((job) => {
      const name = (job.data?.name || job.data?.title || "").toLowerCase();
      const cat = (job.data?.category || "").toLowerCase();
      const rawUrl = (job.data?.image_url || job.data?.originalUrl || job.data?.fileUrl || "").trim();

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery = name.includes(q) || cat.includes(q) || String(job.id).includes(q);
        if (!matchesQuery) return false;
      }

      if (filterDuplicateOnly) {
        const isDup =
          (rawUrl && duplicateInfo.urlMap.get(rawUrl) > 1) ||
          (name && duplicateInfo.nameMap.get(name) > 1);
        if (!isDup) return false;
      }

      if (filterBadImageOnly) {
        const isBad = !rawUrl || rawUrl.length < 10 || !rawUrl.startsWith("http");
        if (!isBad) return false;
      }

      return true;
    });
  }, [rawJobs, searchQuery, filterDuplicateOnly, filterBadImageOnly, duplicateInfo]);

  // Mutations
  const retryMutation = useMutation({
    mutationFn: retryJob,
    onSuccess: (data) => {
      toast.success(data.message || "Job re-queued!");
      queryClient.invalidateQueries({ queryKey: ["bullmq-jobs"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Failed to retry job");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      toast.success("Job and database dish deleted");
      queryClient.invalidateQueries({ queryKey: ["bullmq-jobs"] });
      setSelectedJob(null);
      setInspectImageItem(null);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Failed to delete job");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => deleteSelectedJobs(ids),
    onSuccess: (data) => {
      toast.success(data.message || "Selected jobs deleted from queue and database");
      setSelectedJobIds(new Set());
      setIsBulkDeleteModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["bullmq-jobs"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Failed to delete selected jobs");
    },
  });

  const purgeDuplicatesMutation = useMutation({
    mutationFn: purgeDuplicateJobs,
    onSuccess: (data) => {
      toast.success(data.message || "Duplicate waiting jobs purged!");
      queryClient.invalidateQueries({ queryKey: ["bullmq-jobs"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Failed to purge duplicates");
    },
  });

  const actionMutation = useMutation({
    mutationFn: performQueueAction,
    onSuccess: (data) => {
      toast.success(data.message || "Action completed");
      queryClient.invalidateQueries({ queryKey: ["bullmq-jobs"] });
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || err.message || "Action failed");
    },
  });

  // Selection handlers
  const toggleSelectJob = (id) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllOnPage = () => {
    const allIds = displayedJobs.map((j) => j.id);
    setSelectedJobIds(new Set(allIds));
  };

  const selectAllDuplicates = () => {
    const dupIds = displayedJobs
      .filter((j) => duplicateInfo.duplicateJobIds.has(j.id))
      .map((j) => j.id);
    setSelectedJobIds(new Set(dupIds));
    if (dupIds.length === 0) {
      toast.info("No redundant duplicate jobs found on current page");
    } else {
      toast.success(`Selected ${dupIds.length} duplicate jobs for deletion`);
    }
  };

  const clearSelection = () => {
    setSelectedJobIds(new Set());
  };

  const getStatusBadge = (state) => {
    switch (state) {
      case "active":
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Active
          </Badge>
        );
      case "waiting":
        return (
          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Waiting
          </Badge>
        );
      case "prioritized":
        return (
          <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3 text-purple-500" />
            Prioritised
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{state || "queued"}</Badge>;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 max-w-7xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Queue Dashboard</h1>
            <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
              BullMQ + Redis
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Asynchronous background worker pipeline for AI food photography generation & database syncing.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 gap-1.5"
            asChild
          >
            <a href="http://localhost:3001/admin/queues" target="_blank" rel="noopener noreferrer">
              <Layers className="w-3.5 h-3.5" />
              Bull Board (3001)
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-60" />
            </a>
          </Button>

          {stats.isPaused ? (
            <Button
              size="sm"
              variant="outline"
              className="text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
              onClick={() => actionMutation.mutate("resume")}
              disabled={actionMutation.isPending}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Resume Queue
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
              onClick={() => actionMutation.mutate("pause")}
              disabled={actionMutation.isPending}
            >
              <Pause className="w-3.5 h-3.5 mr-1.5" />
              Pause Queue
            </Button>
          )}

          {stats.waiting > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
              onClick={() => purgeDuplicatesMutation.mutate()}
              disabled={purgeDuplicatesMutation.isPending}
              title="Automatically remove redundant copies of the same image in the queue"
            >
              <CopyX className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              Purge Duplicates
            </Button>
          )}

          {stats.completed > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => actionMutation.mutate("clean_completed")}
              disabled={actionMutation.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear Completed
            </Button>
          )}

          {stats.failed > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                onClick={() => actionMutation.mutate("retry_all_failed")}
                disabled={actionMutation.isPending}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Retry All ({stats.failed})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-500/30"
                onClick={() => actionMutation.mutate("clean_failed")}
                disabled={actionMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Clear Failed
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            className="text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
            onClick={() => actionMutation.mutate({ action: "requeue_unprocessed", limit: 100 })}
            disabled={actionMutation.isPending}
            title="Queue the next 100 unprocessed dishes"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Queue Next (100)
          </Button>

          <Button
            size="sm"
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm"
            onClick={() => {
              if (window.confirm("Are you sure you want to queue all unprocessed dishes from the database into the background AI worker?")) {
                actionMutation.mutate({ action: "requeue_unprocessed", limit: 0 });
              }
            }}
            disabled={actionMutation.isPending}
            title="Queue all unprocessed dishes from database"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Queue ALL Dishes
          </Button>

          {stats.active > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => actionMutation.mutate("reset_stalled")}
              disabled={actionMutation.isPending}
              title="Reset interrupted active jobs back to waiting"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset Stalled
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-border"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Multi-GPU Fleet Status & Control Banner */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-xs shadow-sm overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">AWS EC2 GPU Fleet Manager</h3>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      runningGpuCount > 0
                        ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-600 border-amber-500/30"
                    }`}
                  >
                    {runningGpuCount} of {totalGpuCount} GPUs Running
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Multi-worker pool runs parallel AI generation jobs across all active Tesla T4 instances.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 gap-1.5"
                onClick={() => startAllFleetMutation.mutate()}
                disabled={startAllFleetMutation.isPending || runningGpuCount === totalGpuCount}
              >
                <Play className="w-3.5 h-3.5" />
                Start All ({totalGpuCount})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-rose-600 border-rose-500/30 hover:bg-rose-500/10 gap-1.5"
                onClick={() => {
                  if (window.confirm("Are you sure you want to stop all GPU instances to save AWS costs?")) {
                    stopAllFleetMutation.mutate();
                  }
                }}
                disabled={stopAllFleetMutation.isPending || runningGpuCount === 0}
              >
                <Pause className="w-3.5 h-3.5" />
                Stop All
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => refetchFleet()}
                disabled={isFetchingFleet}
                title="Refresh Fleet Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetchingFleet ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* 3 GPU Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {fleetInstances.map((inst, idx) => {
              const isRunning = inst.state === "running";
              const isPending = inst.state === "pending" || inst.state === "stopping";
              const gpuIndexLabel = `GPU #${idx + 1}`;

              return (
                <div
                  key={inst.instanceId}
                  className={`p-3 rounded-lg border text-xs flex flex-col justify-between gap-2.5 transition-all ${
                    isRunning
                      ? "bg-emerald-500/[0.04] border-emerald-500/30"
                      : "bg-muted/30 border-border/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Cpu className={`w-3.5 h-3.5 ${isRunning ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-foreground">
                          {gpuIndexLabel}: {inst.name}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {inst.publicIp || "No Public IP"} • {inst.instanceType}
                      </p>
                    </div>

                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase font-mono px-1.5 py-0 h-5 ${
                        isRunning
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : inst.state === "pending"
                          ? "bg-amber-500/20 text-amber-600 border-amber-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {inst.state}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                    {inst.comfyUrl && isRunning ? (
                      <a
                        href={inst.comfyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 text-[11px] font-medium"
                      >
                        ComfyUI :8188 <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-[11px] font-mono">
                        {inst.instanceId}
                      </span>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-6 text-[11px] px-2 gap-1 ${
                        isRunning
                          ? "text-rose-600 hover:bg-rose-500/10 border-rose-500/30"
                          : "text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/30"
                      }`}
                      onClick={() =>
                        toggleGpuMutation.mutate({
                          instanceId: inst.instanceId,
                          action: isRunning ? "stop" : "start",
                        })
                      }
                      disabled={isPending || toggleGpuMutation.isPending}
                    >
                      {isRunning ? (
                        <>
                          <Pause className="w-2.5 h-2.5" /> Stop
                        </>
                      ) : (
                        <>
                          <Play className="w-2.5 h-2.5" /> Start
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card
          className={`border-border/50 shadow-sm cursor-pointer transition-all ${activeTab === "prioritized" || activeTab === "waiting" ? "ring-2 ring-purple-500 shadow-purple-500/10" : ""}`}
          onClick={() => { setActiveTab("prioritized"); setPage(1); }}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prioritised / Waiting</p>
              <h3 className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {(stats.prioritized || stats.waiting || 0).toLocaleString()}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`border-border/50 shadow-sm cursor-pointer transition-all ${activeTab === "active" ? "ring-2 ring-amber-500" : ""}`}
          onClick={() => { setActiveTab("active"); setPage(1); }}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.active}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
              <Zap className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`border-border/50 shadow-sm cursor-pointer transition-all ${activeTab === "completed" ? "ring-2 ring-emerald-500" : ""}`}
          onClick={() => { setActiveTab("completed"); setPage(1); }}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.completed}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`border-border/50 shadow-sm cursor-pointer transition-all ${activeTab === "failed" ? "ring-2 ring-rose-500" : ""}`}
          onClick={() => { setActiveTab("failed"); setPage(1); }}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Failed</p>
              <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats.failed}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600">
              <AlertCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Search Filter Controls */}
      <div className="space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val);
            setPage(1);
            setSelectedJobIds(new Set());
          }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <TabsList className="bg-muted/60 p-1 w-full lg:w-auto overflow-x-auto">
              <TabsTrigger value="all">All ({(stats.total || 0).toLocaleString()})</TabsTrigger>
              <TabsTrigger value="prioritized" className="gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-500" />
                Prioritised ({(stats.prioritized || stats.waiting || 0).toLocaleString()})
              </TabsTrigger>
              <TabsTrigger value="active" className="gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Active ({stats.active})
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Completed ({stats.completed})
              </TabsTrigger>
              <TabsTrigger value="failed" className="gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                Failed ({stats.failed})
              </TabsTrigger>
            </TabsList>

            {/* Quick Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search dishes or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>

              {/* Duplicate Filter Toggle */}
              <Button
                size="sm"
                variant={filterDuplicateOnly ? "default" : "outline"}
                onClick={() => setFilterDuplicateOnly(!filterDuplicateOnly)}
                className={`h-9 text-xs gap-1.5 ${filterDuplicateOnly ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-border text-muted-foreground"}`}
              >
                <CopyX className="w-3.5 h-3.5" />
                Duplicates ({duplicateInfo.duplicateJobIds.size})
              </Button>

              {/* Missing Image Filter Toggle */}
              <Button
                size="sm"
                variant={filterBadImageOnly ? "default" : "outline"}
                onClick={() => setFilterBadImageOnly(!filterBadImageOnly)}
                className={`h-9 text-xs gap-1.5 ${filterBadImageOnly ? "bg-rose-600 hover:bg-rose-700 text-white" : "border-border text-muted-foreground"}`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Bad / Missing Image
              </Button>

              {/* Page size select */}
              <Select
                value={pageSize.toString()}
                onValueChange={(val) => {
                  setPageSize(Number(val));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[110px] text-xs">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 / page</SelectItem>
                  <SelectItem value="48">48 / page</SelectItem>
                  <SelectItem value="96">96 / page</SelectItem>
                  <SelectItem value="200">200 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selection Actions Toolbar (When items exist or are selected) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={selectedJobIds.size === displayedJobs.length && displayedJobs.length > 0 ? clearSelection : selectAllOnPage}
                className="h-7 text-xs px-2 gap-1.5"
              >
                {selectedJobIds.size === displayedJobs.length && displayedJobs.length > 0 ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-primary" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    Select All ({displayedJobs.length})
                  </>
                )}
              </Button>

              {duplicateInfo.duplicateJobIds.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={selectAllDuplicates}
                  className="h-7 text-xs px-2 text-amber-600 hover:text-amber-500 gap-1.5"
                >
                  <CopyX className="w-3.5 h-3.5" />
                  Select Duplicates ({duplicateInfo.duplicateJobIds.size})
                </Button>
              )}

              {selectedJobIds.size > 0 && (
                <span className="font-semibold text-primary pl-2 border-l border-border">
                  {selectedJobIds.size} selected
                </span>
              )}
            </div>

            {selectedJobIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs px-2.5 gap-1.5 bg-rose-600 hover:bg-rose-700"
                  onClick={() => bulkDeleteMutation.mutate(Array.from(selectedJobIds))}
                  disabled={bulkDeleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {bulkDeleteMutation.isPending ? "Deleting..." : `Delete Selected (${selectedJobIds.size}) from Queue & DB`}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  className="h-7 text-xs px-2 text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Job Grid / List */}
          <div className="mt-4">
            {isLoading ? (
              <div className="p-16 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <span>Loading queue items & thumbnails...</span>
              </div>
            ) : displayedJobs.length === 0 ? (
              <Card className="border-dashed p-12 text-center text-muted-foreground">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-40 text-primary" />
                <h3 className="font-semibold text-foreground">No dishes matching current view</h3>
                <p className="text-xs mt-1">
                  {searchQuery || filterDuplicateOnly || filterBadImageOnly
                    ? "Try clearing your filters or search terms to view all items."
                    : "Queue dishes from the Scraped Products page or click 'Queue Next' above."}
                </p>
                {(searchQuery || filterDuplicateOnly || filterBadImageOnly) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4 text-xs"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterDuplicateOnly(false);
                      setFilterBadImageOnly(false);
                    }}
                  >
                    Reset Filters
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedJobs.map((job) => {
                  const dishName = job.data?.name || job.data?.title || "Dish Item";
                  const rawImageUrl =
                    job.data?.image_url ||
                    job.data?.originalUrl ||
                    job.data?.fileUrl;
                  const outputImageUrl =
                    job.returnvalue?.optimisedUrl ||
                    job.returnvalue?.imageUrl ||
                    null;
                  const displayImageUrl = outputImageUrl || rawImageUrl;

                  const isSelected = selectedJobIds.has(job.id);
                  const isRedundantDuplicate = duplicateInfo.duplicateJobIds.has(job.id);
                  const urlCount = rawImageUrl ? duplicateInfo.urlMap.get(rawImageUrl.trim()) || 1 : 1;
                  const nameCount = duplicateInfo.nameMap.get(dishName.trim().toLowerCase()) || 1;
                  const maxDupCount = Math.max(urlCount, nameCount);
                  const hasDuplicate = maxDupCount > 1;

                  const isMissingImage = !rawImageUrl || rawImageUrl.length < 10 || !rawImageUrl.startsWith("http");

                  const progressObj = typeof job.progress === "object" && job.progress !== null ? job.progress : null;
                  const progress = typeof job.progress === "number" ? job.progress : progressObj?.percent ?? (job.state === "completed" ? 100 : 0);
                  const activeGpu = progressObj?.gpu || job.returnvalue?.gpu || null;
                  const activeStep = progressObj?.step || null;
                  const durationSec = job.executionTimeSec || job.returnvalue?.durationSec;

                  const compareItem = {
                    id: job.id,
                    name: dishName,
                    originalUrl: rawImageUrl,
                    outputImageUrl: outputImageUrl || displayImageUrl,
                  };

                  return (
                    <div
                      key={job.id}
                      className={`group relative flex flex-col rounded-xl border bg-card p-2.5 overflow-hidden transition-all ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/40 bg-primary/[0.02]"
                          : isRedundantDuplicate
                          ? "border-amber-500/50 bg-amber-500/[0.02]"
                          : "hover:border-emerald-500/40 hover:shadow-md"
                      }`}
                    >
                      {/* Top Selection & Status Overlays */}
                      <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                        {/* Checkbox overlay in top left */}
                        <div className="absolute top-2 left-2 z-30">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectJob(job.id)}
                            className="bg-background/90 backdrop-blur-md border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary shadow-sm h-5 w-5 rounded"
                          />
                        </div>

                        {/* Top-Right Badges */}
                        <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
                          {getStatusBadge(job.state)}
                          {hasDuplicate && (
                            <Badge className="bg-amber-500 text-black font-semibold text-[9px] px-1.5 py-0 h-4 border-none shadow-sm flex items-center gap-0.5">
                              <CopyX className="w-2.5 h-2.5" />
                              {maxDupCount}x Duplicate
                            </Badge>
                          )}
                          {isMissingImage && (
                            <Badge className="bg-rose-600 text-white font-semibold text-[9px] px-1.5 py-0 h-4 border-none shadow-sm flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              No Image
                            </Badge>
                          )}
                        </div>

                        {/* Image Preview */}
                        {displayImageUrl ? (
                          <img
                            src={displayImageUrl}
                            alt={dishName}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                            loading="lazy"
                            onClick={() => setInspectImageItem({ job, rawImageUrl, outputImageUrl, dishName })}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-muted-foreground/50 gap-1">
                            <ImageIcon className="w-8 h-8" />
                            <span className="text-[10px]">No image URL</span>
                          </div>
                        )}

                        {/* Active Spinning Overlay with GPU info */}
                        {job.state === "active" && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-1.5 z-10 p-2 text-center pointer-events-none">
                            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                            <span className="text-[11px] font-semibold text-amber-300">
                              Rendering {progress}%
                            </span>
                            {activeGpu && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/70 border border-amber-500/30 text-amber-200">
                                {activeGpu}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Hover Quick View & Action Bar */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity p-2 z-20 pointer-events-auto">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setInspectImageItem({ job, rawImageUrl, outputImageUrl, dishName })}
                            className="h-7 text-xs bg-background/90 hover:bg-background shadow-md"
                            title="Inspect Source Image & Quality"
                          >
                            <ZoomIn className="mr-1 h-3.5 w-3.5 text-primary" />
                            Inspect
                          </Button>

                          {outputImageUrl && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setCompareModalItem(compareItem)}
                              className="h-7 text-xs bg-background/90 hover:bg-background shadow-md"
                            >
                              <Eye className="mr-1 h-3.5 w-3.5 text-emerald-500" />
                              Compare
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(job.id)}
                            className="h-7 w-7 p-0 bg-rose-600 hover:bg-rose-700 shadow-md text-white"
                            title="Delete this dish from Queue and DB"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Job ID Tag & Processing Sequence Position */}
                        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1">
                          <div className="rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-mono font-medium text-emerald-400 backdrop-blur-md border border-emerald-500/20">
                            #{job.id}
                          </div>
                          {job.state === "waiting" && (
                            <div className="rounded bg-purple-950/90 px-1.5 py-0.5 text-[9px] font-semibold text-purple-200 backdrop-blur-md border border-purple-500/40">
                              ⚡ Next #{(page - 1) * pageSize + displayedJobs.indexOf(job) + 1}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="mt-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-semibold text-sm truncate" title={dishName}>
                            {dishName}
                          </h4>

                          {/* Category & Dietary Badges */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {job.data?.category && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                                {job.data.category}
                              </Badge>
                            )}
                            {job.data?.dietaryType && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                                {job.data.dietaryType}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Status / Timing Section */}
                        <div className="mt-2.5 pt-2 border-t border-border/40">
                          {job.state === "completed" && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-semibold truncate">
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  {durationSec ? `Rendered in ${durationSec}s` : "Processed & Saved"}
                                </span>
                                {outputImageUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setCompareModalItem(compareItem)}
                                    className="text-[11px] text-muted-foreground hover:text-emerald-500 flex items-center gap-1 font-medium transition-colors shrink-0"
                                  >
                                    <Eye className="w-3 h-3" /> Compare
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {job.state === "active" && (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] text-amber-500 font-medium">
                                <span className="truncate pr-1">{activeStep || "Processing in ComfyUI..."}</span>
                                <span>{progress}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 transition-all duration-300 rounded-full animate-pulse"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {(job.state === "waiting" || job.state === "prioritized") && (
                            <div className="flex items-center justify-between text-xs text-purple-400">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{job.state === "prioritized" ? "Prioritised for GPU" : "Queued for GPU"}</span>
                              </span>
                              {hasDuplicate && (
                                <span className="text-[10px] text-amber-500 font-medium">Duplicate</span>
                              )}
                            </div>
                          )}

                          {job.state === "failed" && (
                            <div className="space-y-1">
                              {job.failedReason && (
                                <p className="text-[11px] text-rose-500 truncate" title={job.failedReason}>
                                  ⚠ {job.failedReason}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Bottom Actions Toolbar */}
                        <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="text-[10px] font-mono opacity-70">
                            {job.processedOn
                              ? new Date(job.processedOn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                              : "Queued"}
                          </span>

                          <div className="flex items-center gap-1">
                            {job.state === "failed" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                onClick={() => retryMutation.mutate(job.id)}
                                disabled={retryMutation.isPending}
                                title="Retry Job"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            {outputImageUrl && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => handleDownloadSingle(outputImageUrl, dishName)}
                                title="Download image"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => setSelectedJob(job)}
                              title="View BullMQ Job Details"
                            >
                              <Activity className="w-3.5 h-3.5" />
                            </Button>

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                              onClick={() => deleteMutation.mutate(job.id)}
                              disabled={deleteMutation.isPending}
                              title="Delete Job & Database Dish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border bg-card text-xs text-muted-foreground">
              <div>
                Showing page <span className="font-semibold text-foreground">{page}</span> of{" "}
                <span className="font-semibold text-foreground">{totalPages}</span> ({totalCount} total items)
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <span className="px-3 py-1 font-mono font-medium text-foreground bg-muted rounded">
                  {page} / {totalPages}
                </span>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Tabs>
      </div>

      {/* Image Inspection & Quality Modal */}
      {inspectImageItem && (
        <Dialog open={Boolean(inspectImageItem)} onOpenChange={(open) => !open && setInspectImageItem(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                <span>Inspect Queued Dish Image</span>
              </DialogTitle>
              <DialogDescription>
                Review image quality before background AI processing. Deleting will remove it from both the queue and database.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Large Image Preview */}
              <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-black/90 flex items-center justify-center border">
                {inspectImageItem.rawImageUrl ? (
                  <img
                    src={inspectImageItem.rawImageUrl}
                    alt={inspectImageItem.dishName}
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-muted-foreground space-y-1">
                    <AlertTriangle className="w-8 h-8 mx-auto text-rose-500" />
                    <p>No valid image URL provided</p>
                  </div>
                )}
              </div>

              {/* Details table */}
              <div className="bg-muted/40 p-3.5 rounded-xl border border-border/50 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dish Name:</span>
                  <span className="font-semibold">{inspectImageItem.dishName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Job ID:</span>
                  <span className="font-mono">#{inspectImageItem.job?.id}</span>
                </div>
                {inspectImageItem.job?.data?.category && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span>{inspectImageItem.job?.data?.category}</span>
                  </div>
                )}
                {inspectImageItem.job?.data?.dietaryType && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dietary Type:</span>
                    <span>{inspectImageItem.job?.data?.dietaryType}</span>
                  </div>
                )}
                {inspectImageItem.rawImageUrl && (
                  <div className="flex justify-between items-center pt-1 border-t border-border/30">
                    <span className="text-muted-foreground">Source URL:</span>
                    <a
                      href={inspectImageItem.rawImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate max-w-[280px]"
                    >
                      Open Raw Image <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectImageItem(null)}
              >
                Close
              </Button>

              <Button
                variant="destructive"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 gap-1.5"
                onClick={() => {
                  deleteMutation.mutate(inspectImageItem.job.id);
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete from Queue & DB
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {isBulkDeleteModalOpen && (
        <Dialog open={isBulkDeleteModalOpen} onOpenChange={setIsBulkDeleteModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <Trash2 className="w-5 h-5" />
                <span>Delete {selectedJobIds.size} Queued Dishes?</span>
              </DialogTitle>
              <DialogDescription>
                This will permanently remove the selected {selectedJobIds.size} jobs from the BullMQ queue AND delete their dish entries from the database so they will not be processed.
              </DialogDescription>
            </DialogHeader>

            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-600 space-y-1">
              <p className="font-semibold">⚠️ Irreversible Action</p>
              <p>The selected items will be completely removed from the queue and database.</p>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={bulkDeleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700"
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedJobIds))}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Deleting...
                  </>
                ) : (
                  `Yes, Delete ${selectedJobIds.size} Dishes`
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <Dialog open={Boolean(selectedJob)} onOpenChange={(open) => !open && setSelectedJob(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Job #{selectedJob.id}: {selectedJob.data?.name || "Dish"}</span>
                {getStatusBadge(selectedJob.state)}
              </DialogTitle>
              <DialogDescription>
                Detailed BullMQ execution data and S3 output information.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              {/* Image Previews */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-lg p-2 bg-muted/20">
                  <p className="font-semibold text-muted-foreground mb-1.5">Original / Subject Source:</p>
                  <img
                    src={selectedJob.data?.image_url || selectedJob.data?.originalUrl}
                    alt="Original"
                    className="w-full h-32 object-cover rounded"
                  />
                </div>
                <div className="border rounded-lg p-2 bg-muted/20">
                  <p className="font-semibold text-muted-foreground mb-1.5">AI Rendered Output:</p>
                  {selectedJob.returnvalue?.imageUrl ? (
                    <img
                      src={selectedJob.returnvalue.imageUrl}
                      alt="Rendered Output"
                      className="w-full h-32 object-cover rounded"
                    />
                  ) : (
                    <div className="w-full h-32 flex items-center justify-center text-muted-foreground bg-muted/40 rounded">
                      Pending / In Progress
                    </div>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className="space-y-2 bg-muted/40 p-3 rounded-lg border border-border/50">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category:</span>
                  <span className="font-medium">{selectedJob.data?.category || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dietary Type:</span>
                  <span className="font-medium">{selectedJob.data?.dietaryType || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attempts:</span>
                  <span className="font-medium">{selectedJob.attemptsMade || 0}</span>
                </div>
                {selectedJob.returnvalue?.durationSec && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">{selectedJob.returnvalue.durationSec}s</span>
                  </div>
                )}
                {(selectedJob.returnvalue?.gpu || (typeof selectedJob.progress === "object" && selectedJob.progress?.gpu)) && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">GPU Server:</span>
                    <span className="font-mono text-emerald-500 font-medium">
                      {selectedJob.returnvalue?.gpu || selectedJob.progress?.gpu}
                    </span>
                  </div>
                )}
                {selectedJob.returnvalue?.imageUrl && (
                  <div className="flex justify-between items-center pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">S3 Master:</span>
                    <a
                      href={selectedJob.returnvalue.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      View in S3 <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                {selectedJob.returnvalue?.optimisedUrl && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">S3 AVIF (4:3):</span>
                    <a
                      href={selectedJob.returnvalue.optimisedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      View AVIF <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {selectedJob.failedReason && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400">
                  <p className="font-semibold mb-1">Error Reason:</p>
                  <p className="font-mono text-[11px] whitespace-pre-wrap">{selectedJob.failedReason}</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex justify-between items-center sm:justify-between">
              <Button
                variant="destructive"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 gap-1.5"
                onClick={() => {
                  deleteMutation.mutate(selectedJob.id);
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Job & DB Dish
              </Button>

              <Button variant="outline" size="sm" onClick={() => setSelectedJob(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Interactive Before vs After Comparison Modal */}
      {compareModalItem && (
        <ImageCompareModal
          item={compareModalItem}
          isOpen={Boolean(compareModalItem)}
          onClose={() => setCompareModalItem(null)}
        />
      )}
    </div>
  );
}
