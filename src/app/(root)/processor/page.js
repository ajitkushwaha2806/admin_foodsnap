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
import { Sparkles, Sliders, CheckCircle2, AlertCircle, RefreshCw, UtensilsCrossed, Layers, Split } from "lucide-react";
import { BatchRunnerService } from "@/services/frontend/processor/batch-runner.service";
import { ComboMealStudio } from "@/components/studio/combo-studio";


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
  const requestedIds = searchParams.get("ids");
  const requestedSearch = searchParams.get("search");
  const requestedCategory = searchParams.get("category");
  const requestedDietary = searchParams.get("dietaryType");
  const requestedMode = searchParams.get("mode");
  const requestedPage = parseInt(searchParams.get("page") || "1", 10);
  const requestedLimit = parseInt(searchParams.get("limit") || "24", 10);
  const autoStartRequested = searchParams.get("autostart") === "true";

  // Check if user explicitly navigated here to process specific items
  const hasExplicitRequest = Boolean(
    requestedProductId ||
    requestedIds ||
    requestedMode ||
    autoStartRequested ||
    requestedSearch ||
    requestedCategory ||
    requestedDietary
  );

  const [config, setConfig] = useState(DEFAULT_WORKFLOW_CONFIG);
  const [studioMode, setStudioMode] = useState(requestedMode === "combo" ? "combo" : "batch");
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
  const hasInitializedFromDbRef = useRef(false);
  const userManuallyClearedRef = useRef(false);

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

  // Query scraped products from MongoDB ONLY when explicitly requested via URL
  const { data: dbProductsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: [
      "scraped-products-for-processor",
      { requestedProductId, requestedIds, requestedSearch, requestedCategory, requestedDietary, requestedMode, requestedPage, requestedLimit },
    ],
    queryFn: () => {
      if (requestedProductId) {
        return getProducts({ ids: requestedProductId });
      }
      if (requestedIds) {
        return getProducts({ ids: requestedIds });
      }
      return getProducts({
        search: requestedSearch || undefined,
        category: requestedCategory && requestedCategory !== "all" ? requestedCategory : undefined,
        dietaryType: requestedDietary && requestedDietary !== "all" ? requestedDietary : undefined,
        page: requestedMode === "all" ? 1 : requestedPage,
        limit: requestedMode === "all" ? 500 : requestedLimit,
      });
    },
    enabled: hasExplicitRequest,
    staleTime: 30000,
  });

  // Auto-populate dishes from DB ONLY if explicitly requested and not manually cleared
  useEffect(() => {
    if (!hasExplicitRequest || userManuallyClearedRef.current) return;

    if (
      dbProductsData?.data &&
      Array.isArray(dbProductsData.data) &&
      !hasInitializedFromDbRef.current
    ) {
      hasInitializedFromDbRef.current = true;
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
  }, [hasExplicitRequest, dbProductsData, requestedProductId]);

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
    hasInitializedFromDbRef.current = true;
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
    hasInitializedFromDbRef.current = true;
    // Replace the queue with only the imported/selected items
    setItems(importedItems);
  };

  const handleRemoveItem = (id) => {
    hasInitializedFromDbRef.current = true;
    const target = items.find((item) => item.id === id);
    if (target?.previewUrl && target.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(target.previewUrl);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    userManuallyClearedRef.current = true;
    hasInitializedFromDbRef.current = true;
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
            onClick={() => setIsProductImportOpen(true)}
            className="text-xs h-8 gap-1.5 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
            title="Import dishes from scraped menus"
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500" />
            Import Scraped Dishes
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

      {/* Mode Tab Switcher */}
      <div className="flex items-center gap-2 p-1 bg-muted/60 rounded-xl w-fit border shadow-sm">
        <button
          type="button"
          onClick={() => setStudioMode("batch")}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            studioMode === "batch"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-3.5 w-3.5 text-orange-500" />
          Single Dish Batch Queue
          <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">
            {items.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setStudioMode("combo")}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            studioMode === "combo"
              ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          🍔🥤 Multi-Item Meal Combo Studio
          <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full font-bold ml-1">
            ⚡ 1-Pass Fast
          </span>
        </button>
      </div>

      {studioMode === "combo" ? (
        <ComboMealStudio
          config={config}
          isServerOffline={!isConnected}
          onOpenSettings={() => setIsSettingsOpen(true)}
          savedBackgrounds={savedBackgrounds}
        />
      ) : (
        <>
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
        </>
      )}


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
