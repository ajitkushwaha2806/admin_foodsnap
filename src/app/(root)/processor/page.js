"use client";
import { generateUUID } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { getProducts } from "@/services/frontend/products";
import { ComfyUIService } from "@/services/frontend/comfyui";
import { ResultsGrid } from "@/components/studio/results-grid";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { getSavedBackgrounds } from "@/services/frontend/backgrounds";
import { DEFAULT_WORKFLOW_CONFIG } from "@/lib/comfyui/workflow-builder";
import { ConnectionBanner } from "@/components/studio/connection-banner";
import { BackgroundUpload } from "@/components/studio/background-upload";
import { QueueLiveTracker } from "@/components/studio/queue-live-tracker";
import { ImageCompareModal } from "@/components/studio/image-compare-modal";
import { ProductImportModal } from "@/components/studio/product-import-modal";
import { SubjectBatchUpload } from "@/components/studio/subject-batch-upload";
import { WorkflowSettingsModal } from "@/components/studio/workflow-settings-modal";
import { Sparkles, Sliders, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { BatchRunnerService } from "@/services/frontend/processor/batch-runner.service";

export default function AIProcessorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading AI Studio...</div>}>
      <AIProcessorContent />
    </Suspense>
  );
}

function AIProcessorContent() {
  const searchParams = useSearchParams();
  const requestedProductId = searchParams.get("productId");
  const autoStartRequested = searchParams.get("autostart") === "true";

  const [config, setConfig] = useState(DEFAULT_WORKFLOW_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProductImportOpen, setIsProductImportOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [background, setBackground] = useState({
    file: null,
    previewUrl: "",
    name: "",
    size: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [logs, setLogs] = useState([]);
  const [compareModalItem, setCompareModalItem] = useState(null);

  const runnerRef = useRef(null);
  const timerRef = useRef(null);
  const hasAutoStartedRef = useRef(false);

  // TanStack Query to monitor ComfyUI server health
  const {
    data: systemStats,
    isError: isServerOffline,
    isLoading: isCheckingServer,
    refetch: refetchServerStats,
  } = useQuery({
    queryKey: ["comfyui-stats", config.serverUrl],
    queryFn: () => ComfyUIService.getSystemStats(config.serverUrl),
    refetchInterval: 15000,
    retry: 1,
  });

  // Query scraped products from MongoDB to auto-populate the queue if items are empty
  const { data: dbProductsData, isLoading: isLoadingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ["scraped-products-for-processor"],
    queryFn: () => getProducts({ limit: 100 }),
    staleTime: 30000,
  });

  // Auto-populate dishes from DB
  useEffect(() => {
    if (dbProductsData?.data && Array.isArray(dbProductsData.data) && items.length === 0) {
      let filtered = dbProductsData.data;
      if (requestedProductId) {
        const found = dbProductsData.data.find((p) => p._id === requestedProductId);
        if (found) filtered = [found];
      }

      const formatted = filtered.map((p) => ({
        id: p._id,
        productId: p._id,
        name: p.name,
        description: p.description,
        originalUrl: p.image_url,
        previewUrl: p.image_url,
        category: p.category,
        sub_category: p.sub_category,
        dietaryType: p.dietaryType,
        food_type: p.dietaryType,
        status: "idle",
        progress: 0,
      }));

      setItems(formatted);
    }
  }, [dbProductsData, requestedProductId, items.length]);

  // Batch Execution Engine
  const executeBatch = React.useCallback(async (batchItems, targetBackground) => {
    if (batchItems.length === 0 || !targetBackground?.file || isProcessing) return;

    setIsProcessing(true);
    setElapsedTime(0);
    setCompletedCount(0);
    setLogs([`[System] Launching batch queue for ${batchItems.length} products...`]);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime((Date.now() - startTime) / 1000);
    }, 200);

    const runner = new BatchRunnerService(config, {
      onItemUpdate: (itemId, patch) => {
        setItems((prev) =>
          prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
        );
      },
      onOverallProgress: (completed) => {
        setCompletedCount(completed);
      },
      onLog: (msg) => {
        setLogs((prev) => [...prev.slice(-200), msg]);
      },
    });

    runnerRef.current = runner;

    try {
      await runner.runBatch(batchItems, targetBackground);
    } catch (err) {
      setLogs((prev) => [...prev, `[System Error] ${err.message}`]);
    } finally {
      setIsProcessing(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [config, isProcessing]);

  // Fetch saved backgrounds to use in autostart if needed
  const { data: savedBackgrounds = [] } = useQuery({
    queryKey: ["saved-backgrounds"],
    queryFn: getSavedBackgrounds,
  });

  // If autostart is requested and background is missing, load user's saved background if available
  useEffect(() => {
    async function setupSavedBackgroundAndAutoStart() {
      if (
        autoStartRequested &&
        !hasAutoStartedRef.current &&
        items.length > 0 &&
        !isProcessing &&
        !isServerOffline
      ) {
        let currentBg = background;
        if (!currentBg.file && savedBackgrounds.length > 0) {
          const firstBg = savedBackgrounds[0];
          try {
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(firstBg.image_url)}`;
            const res = await fetch(proxyUrl);
            const blob = await res.blob();
            const file = new File([blob], `${firstBg.name.toLowerCase().replace(/\s+/g, "_")}.jpg`, { type: "image/jpeg" });
            const previewUrl = URL.createObjectURL(file);
            currentBg = {
              file,
              previewUrl,
              name: firstBg.name,
              size: file.size,
            };
            setBackground(currentBg);
          } catch (e) {
            console.error("Failed to load saved background for autostart:", e);
            return;
          }
        }

        if (currentBg?.file) {
          hasAutoStartedRef.current = true;
          executeBatch(items, currentBg);
        }
      }
    }

    setupSavedBackgroundAndAutoStart();
  }, [autoStartRequested, items, background, isProcessing, isServerOffline, executeBatch, savedBackgrounds]);

  const isConnected = !isServerOffline && !!systemStats;

  // Add multiple subject files
  const handleAddFiles = (files) => {
    const newItems = files.map((file) => ({
      id: generateUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name.replace(/\.[^/.]+$/, ""),
      size: file.size,
      status: "idle",
      progress: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const handleImportProducts = (importedItems) => {
    setItems((prev) => [
      ...importedItems,
      ...prev.filter((p) => !importedItems.some((n) => n.id === p.id)),
    ]);
  };

  const handleRemoveItem = (id) => {
    const target = items.find((item) => item.id === id);
    if (target?.previewUrl && target.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(target.previewUrl);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    items.forEach((item) => {
      if (item.previewUrl && item.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    setItems([]);
    setCompletedCount(0);
    setLogs([]);
  };

  const handleSetBackground = (bgData) => {
    if (background.previewUrl && background.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(background.previewUrl);
    }
    setBackground(bgData);
  };

  const handleRemoveBackground = () => {
    if (background.previewUrl && background.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(background.previewUrl);
    }
    setBackground({ file: null, previewUrl: "", name: "", size: 0 });
  };

  const handleStartProcessing = () => {
    executeBatch(items, background);
  };

  const handleCancelProcessing = () => {
    if (runnerRef.current) {
      runnerRef.current.cancel();
    }
    setIsProcessing(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              AI Image Studio & Processor
            </h1>
            {isConnected ? (
              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> ComfyUI Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-rose-500 border-rose-500/30 bg-rose-500/10 font-mono">
                <AlertCircle className="w-2.5 h-2.5 mr-1" /> Server Offline
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Queue dishes, replace background surfaces via Flux.2 Klein, and save directly to your Image database (approved: false, premium: false).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchProducts()}
            disabled={isLoadingProducts}
            className="text-xs h-8 gap-1.5"
            title="Reload products from DB"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProducts ? "animate-spin" : ""}`} />
            Sync DB Products
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
            className="text-xs h-8 gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-orange-500" />
            Workflow Settings
          </Button>
        </div>
      </div>

      {/* Server Offline Warning Banner */}
      <ConnectionBanner
        isConnected={isConnected}
        serverUrl={config.serverUrl}
        onRetry={refetchServerStats}
        isLoading={isCheckingServer}
      />

      {/* 2-Column Upload Studio (Subjects & Background) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8">
          <SubjectBatchUpload
            items={items}
            onAddFiles={handleAddFiles}
            onRemoveItem={handleRemoveItem}
            onClearAll={handleClearAll}
            onOpenProductImport={() => setIsProductImportOpen(true)}
            isProcessing={isProcessing}
          />
        </div>

        <div className="lg:col-span-4">
          <BackgroundUpload
            background={background}
            onSetBackground={handleSetBackground}
            onRemoveBackground={handleRemoveBackground}
            isProcessing={isProcessing}
          />
        </div>
      </div>

      {/* Live Queue Controller */}
      <QueueLiveTracker
        items={items}
        background={background}
        isProcessing={isProcessing}
        onStartProcessing={handleStartProcessing}
        onCancelProcessing={handleCancelProcessing}
        completedCount={completedCount}
        totalCount={items.length}
        elapsedTime={elapsedTime}
        logs={logs}
      />

      {/* Results Gallery */}
      <ResultsGrid
        items={items}
        onOpenCompare={(item) => setCompareModalItem(item)}
      />

      {/* Scraped Products Import Modal */}
      <ProductImportModal
        isOpen={isProductImportOpen}
        onClose={() => setIsProductImportOpen(false)}
        onImportToStudio={handleImportProducts}
      />

      {/* Before / After Comparison Modal */}
      <ImageCompareModal
        item={compareModalItem}
        isOpen={!!compareModalItem}
        onClose={() => setCompareModalItem(null)}
      />

      {/* Workflow & Server Settings Modal */}
      <WorkflowSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => setConfig(newConfig)}
      />
    </div>
  );
}
