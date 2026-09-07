"use client";

import React, { useState, useRef } from "react";
import {
  Sparkles,
  UploadCloud,
  ImageIcon,
  UtensilsCrossed,
  GlassWater,
  Layers,
  ArrowRight,
  Zap,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Eye,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ComfyUIService } from "@/services/frontend/comfyui";
import {
  buildComfyWorkflowPrompt,
  DEFAULT_COMBO_PROMPT,
} from "@/lib/comfyui/workflow-builder";
import { optimizeImageForGeneration, generateUUID } from "@/lib/utils";
import { ComfyWebSocketClient } from "@/lib/comfyui/websocket-client";
import { ImageCompareModal } from "../image-compare-modal";
import axios from "axios";

// Helper: load image element
function loadImageElement(fileOrUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (typeof fileOrUrl === "string") {
      img.src = fileOrUrl;
    } else {
      img.src = URL.createObjectURL(fileOrUrl);
    }
  });
}

// Helper: create side-by-side composite canvas
async function createSideBySideComposite(file1, file2, targetWidth = 1280, targetHeight = 850) {
  const [img1, img2] = await Promise.all([
    loadImageElement(file1),
    loadImageElement(file2),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");

  // Fill clean neutral white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Compute aspect ratios
  // Primary dish (left side)
  const pad = 40;
  const maxW1 = targetWidth * 0.52 - pad;
  const maxH1 = targetHeight - pad * 2;
  const scale1 = Math.min(maxW1 / img1.width, maxH1 / img1.height);
  const w1 = img1.width * scale1;
  const h1 = img1.height * scale1;
  const x1 = pad + (maxW1 - w1) / 2;
  const y1 = targetHeight - h1 - pad;
  ctx.drawImage(img1, x1, y1, w1, h1);

  // Secondary dish / drink (right side)
  const maxW2 = targetWidth * 0.44 - pad;
  const maxH2 = targetHeight - pad * 2;
  const scale2 = Math.min(maxW2 / img2.width, maxH2 / img2.height);
  const w2 = img2.width * scale2;
  const h2 = img2.height * scale2;
  const x2 = targetWidth * 0.52 + (maxW2 - w2) / 2;
  const y2 = targetHeight - h2 - pad;
  ctx.drawImage(img2, x2, y2, w2, h2);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob], "composite_dish1_dish2.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  });
}

export function ComboMealStudio({
  config,
  isServerOffline,
  onOpenSettings,
  savedBackgrounds = [],
}) {
  // Input Slots
  const [dish1, setDish1] = useState({ file: null, previewUrl: "", name: "" });
  const [dish2, setDish2] = useState({ file: null, previewUrl: "", name: "" });
  const [background, setBackground] = useState({ file: null, previewUrl: "", name: "" });

  // Settings & Prompts
  const [prompt, setPrompt] = useState(DEFAULT_COMBO_PROMPT);
  const [pipelineMode, setPipelineMode] = useState("single_pass"); // "single_pass" (~120s) | "two_stage" (~450s)
  const [qualityPreset, setQualityPreset] = useState("fast"); // 'fast' = 0.38 MP, 'high' = 0.50 MP

  // Execution State
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStepInfo, setCurrentStepInfo] = useState("");
  const [generatedResult, setGeneratedResult] = useState(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [isSavingToDb, setIsSavingToDb] = useState(false);

  // File Input Refs
  const dish1InputRef = useRef(null);
  const dish2InputRef = useRef(null);
  const bgInputRef = useRef(null);
  const activePromptIdRef = useRef(null);
  const wsClientRef = useRef(null);

  const handleSlotUpload = (slot, file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const item = {
      file,
      previewUrl,
      name: file.name.replace(/\.[^/.]+$/, ""),
    };
    if (slot === "dish1") setDish1(item);
    if (slot === "dish2") setDish2(item);
    if (slot === "bg") setBackground(item);
  };

  const handleSelectPresetBackground = async (bgItem) => {
    try {
      const url = bgItem.image_url || bgItem.previewUrl || bgItem.url;
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      const blob = await res.blob();
      const file = new File([blob], `${bgItem.name || "background"}.jpg`, { type: blob.type || "image/jpeg" });
      setBackground({
        file,
        previewUrl: URL.createObjectURL(blob),
        name: bgItem.name || "Background Surface",
      });
      toast.success(`Selected background: ${bgItem.name || "Background"}`);
    } catch (err) {
      toast.error("Failed to load preset background");
    }
  };

  const handleClearSlot = (slot) => {
    if (slot === "dish1") setDish1({ file: null, previewUrl: "", name: "" });
    if (slot === "dish2") setDish2({ file: null, previewUrl: "", name: "" });
    if (slot === "bg") setBackground({ file: null, previewUrl: "", name: "" });
  };

  // Run ComfyUI execution promise
  const executePromptAndWait = async (workflowPrompt, clientId, startPct, endPct, stepLabel) => {
    return new Promise(async (resolve, reject) => {
      let checkHistoryInterval = null;

      const cleanup = () => {
        if (checkHistoryInterval) clearInterval(checkHistoryInterval);
      };

      const ws = new ComfyWebSocketClient(config.serverUrl, clientId, {
        onProgress: (data) => {
          if (data.max > 0) {
            const range = endPct - startPct;
            const pct = startPct + Math.round((data.value / data.max) * range);
            setProgress(Math.min(pct, endPct));
            setCurrentStepInfo(`${stepLabel}: Step ${data.value} of ${data.max}`);
          }
        },
        onExecuting: (data) => {
          if (data.node) {
            setCurrentStepInfo(`${stepLabel} (Node ${data.node})...`);
          }
        },
        onExecuted: (data) => {
          if (data.prompt_id === activePromptIdRef.current && data.output?.images?.length > 0) {
            cleanup();
            resolve(data.output.images[0]);
          }
        },
        onExecutionError: (err) => {
          cleanup();
          reject(new Error(err.exception_message || "ComfyUI Execution Error"));
        },
      });

      wsClientRef.current = ws;
      ws.connect();

      // Queue prompt
      const queueRes = await ComfyUIService.queuePrompt(workflowPrompt, clientId, config.serverUrl);
      activePromptIdRef.current = queueRes.prompt_id;

      // Fallback poller
      checkHistoryInterval = setInterval(async () => {
        if (!activePromptIdRef.current) return;
        try {
          const hist = await ComfyUIService.getHistory(activePromptIdRef.current, config.serverUrl);
          if (hist && hist[activePromptIdRef.current]) {
            const out = hist[activePromptIdRef.current].outputs || {};
            for (const key of Object.keys(out)) {
              if (out[key].images?.length > 0) {
                cleanup();
                resolve(out[key].images[0]);
                break;
              }
            }
          }
        } catch (_) {}
      }, 2000);
    });
  };

  const handleGenerateCombo = async () => {
    if (!dish1.file) {
      toast.error("Please upload the Primary Main Dish (reference_image1)");
      return;
    }
    if (!dish2.file) {
      toast.error("Please upload the Secondary Drink / Side Dish (reference_image2)");
      return;
    }
    if (!background.file) {
      toast.error("Please upload or select a Table Background (reference_image2)");
      return;
    }
    if (isServerOffline) {
      toast.error("ComfyUI server is offline. Please start it using 'npm run comfy'");
      return;
    }

    setIsGenerating(true);
    setProgress(5);
    setGeneratedResult(null);

    const clientId = generateUUID();
    const maxDim = qualityPreset === "high" ? 1200 : 1024;
    const subjectMp = qualityPreset === "high" ? 0.50 : 0.38;
    const bgMp = qualityPreset === "high" ? 0.40 : 0.30;

    try {
      if (pipelineMode === "single_pass") {
        // ⚡ OPTION A: Single-Pass Pre-composite onto Target Table (~120s)
        setCurrentStepInfo("Auto-compositing dishes onto staging canvas...");
        const compositeFile = await createSideBySideComposite(dish1.file, dish2.file, 1280, 850);
        setProgress(15);

        setCurrentStepInfo("Optimizing and uploading composite dish & table background...");
        const [optComposite, optBg] = await Promise.all([
          optimizeImageForGeneration(compositeFile, maxDim),
          optimizeImageForGeneration(background.file, maxDim),
        ]);

        const [resComposite, resBg] = await Promise.all([
          ComfyUIService.uploadImage(optComposite, config.serverUrl, true),
          ComfyUIService.uploadImage(optBg, config.serverUrl, true),
        ]);

        setProgress(30);
        setCurrentStepInfo("Placing combo dishes onto table with ambient contact shadows...");

        const workflowPrompt = buildComfyWorkflowPrompt({
          subjectImageFilename: resComposite.name,
          backgroundImageFilename: resBg.name,
          promptText: prompt,
          config: {
            ...config,
            subjectMegapixels: subjectMp,
            backgroundMegapixels: bgMp,
            steps: config.steps || 4,
          },
        });

        const outputImg = await executePromptAndWait(
          workflowPrompt,
          clientId,
          30,
          95,
          "Denoising Combo on Table"
        );

        const viewUrl = ComfyUIService.getImageUrl(
          outputImg.filename,
          outputImg.subfolder,
          outputImg.type,
          config.serverUrl
        );

        const imgBlobResp = await fetch(viewUrl);
        const imgBlob = await imgBlobResp.blob();
        const localResultUrl = URL.createObjectURL(imgBlob);

        setGeneratedResult({
          url: localResultUrl,
          blob: imgBlob,
          filename: outputImg.filename,
          primaryName: dish1.name,
          secondaryName: dish2.name,
          promptUsed: prompt,
          generatedAt: new Date().toISOString(),
        });
      } else {
        // 🔄 OPTION B: Two-Stage Sequential Pipeline (~450s)
        // Stage 1: Extract & combine Dish 1 + Dish 2
        setCurrentStepInfo("[Stage 1/2] Combining Primary Dish + Drink...");
        const [optDish1, optDish2] = await Promise.all([
          optimizeImageForGeneration(dish1.file, maxDim),
          optimizeImageForGeneration(dish2.file, maxDim),
        ]);

        const [resDish1, resDish2] = await Promise.all([
          ComfyUIService.uploadImage(optDish1, config.serverUrl, true),
          ComfyUIService.uploadImage(optDish2, config.serverUrl, true),
        ]);

        const stage1Prompt =
          "A commercial studio food photographic shot of a delicious meal combo. Extract ONLY the primary main dish from reference_image1 and the secondary food or beverage from reference_image2. Arrange both items neatly side-by-side in a balanced gourmet presentation. Remove all stray garnishes, non-appetizing ingredients, loose side items, and distracting background props from both reference images. Keep both main food items crisp, appetizing, and perfectly detailed with natural restaurant lighting.";

        const stage1Workflow = buildComfyWorkflowPrompt({
          subjectImageFilename: resDish1.name,
          backgroundImageFilename: resDish2.name,
          promptText: stage1Prompt,
          config: {
            ...config,
            subjectMegapixels: subjectMp,
            backgroundMegapixels: subjectMp,
            steps: config.steps || 4,
          },
        });

        const stage1Output = await executePromptAndWait(
          stage1Workflow,
          clientId,
          10,
          50,
          "[Stage 1/2] Extracting Combo"
        );

        // Stage 2: Transfer Stage 1 Output -> Target Table Background
        setCurrentStepInfo("[Stage 2/2] Placing Combo onto Table Background...");
        const optBg = await optimizeImageForGeneration(background.file, maxDim);
        const resBg = await ComfyUIService.uploadImage(optBg, config.serverUrl, true);

        const stage2Prompt =
          "Seamlessly transfer and place all the food dishes from reference_image1 onto the exact table surface and background environment of reference_image2. Replace the old background completely with the surface from reference_image2. Preserve the food items from reference_image1 intact with sharp details, and cast realistic, soft ambient contact shadows naturally onto the new surface.";

        const stage2Workflow = buildComfyWorkflowPrompt({
          subjectImageFilename: stage1Output.filename,
          backgroundImageFilename: resBg.name,
          promptText: stage2Prompt,
          config: {
            ...config,
            subjectMegapixels: subjectMp,
            backgroundMegapixels: bgMp,
            steps: config.steps || 4,
          },
        });

        const stage2Output = await executePromptAndWait(
          stage2Workflow,
          clientId,
          50,
          95,
          "[Stage 2/2] Blending on Table"
        );

        const viewUrl = ComfyUIService.getImageUrl(
          stage2Output.filename,
          stage2Output.subfolder,
          stage2Output.type,
          config.serverUrl
        );

        const imgBlobResp = await fetch(viewUrl);
        const imgBlob = await imgBlobResp.blob();
        const localResultUrl = URL.createObjectURL(imgBlob);

        setGeneratedResult({
          url: localResultUrl,
          blob: imgBlob,
          filename: stage2Output.filename,
          primaryName: dish1.name,
          secondaryName: dish2.name,
          promptUsed: stage2Prompt,
          generatedAt: new Date().toISOString(),
        });
      }

      setProgress(100);
      setCurrentStepInfo("Combo meal composition completed on target background!");
      toast.success("✨ Meal Combo placed seamlessly onto target table background!");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to generate combo meal");
      setCurrentStepInfo(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
      }
    }
  };

  const handleSaveToDatabase = async () => {
    if (!generatedResult) return;
    setIsSavingToDb(true);
    try {
      const formData = new FormData();
      const filename = `combo_${dish1.name}_${dish2.name}_${Date.now()}.jpg`.replace(/\s+/g, "_");
      formData.append("file", generatedResult.blob, filename);

      await axios.post("/api/images", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("✅ Saved combo image directly to S3 and Database!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save to database: " + (err.response?.data?.error || err.message));
    } finally {
      setIsSavingToDb(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Speed Banner */}
      <div className="rounded-xl border bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-orange-500 text-white hover:bg-orange-600 text-xs px-2 py-0.5">
                ⚡ {pipelineMode === "single_pass" ? "Single-Pass Fast (~120s)" : "Two-Stage Sequential (~450s)"}
              </Badge>
              <h2 className="text-base font-bold tracking-tight">
                Multi-Item Meal Combo Studio (Flux.2 Klein 4B)
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Extract and compose 2 food items (e.g. Burger + Shake) onto your chosen table surface with realistic ambient contact shadows.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => ComfyUIService.freeMemory(config.serverUrl, false).then(() => toast.success("RAM & VRAM released!"))}
              className="text-xs h-8"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Free VRAM
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenSettings} className="text-xs h-8">
              <Sliders className="mr-1.5 h-3.5 w-3.5" /> Workflow Config
            </Button>
          </div>
        </div>
      </div>

      {/* 3 Input Slots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Slot 1: Primary Dish */}
        <Card className="shadow-sm border-orange-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold flex items-center gap-1.5 text-orange-500">
                <UtensilsCrossed className="h-4 w-4" />
                1. Primary Main Dish
              </CardTitle>
              {dish1.file && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleClearSlot("dish1")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <CardDescription className="text-[11px]">
              Burger, Pizza, Biryani (Left slot)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              ref={dish1InputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => handleSlotUpload("dish1", e.target.files?.[0])}
            />
            {dish1.previewUrl ? (
              <div className="relative group rounded-lg overflow-hidden border aspect-video bg-muted/30 flex items-center justify-center">
                <img src={dish1.previewUrl} alt="Dish 1" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => dish1InputRef.current?.click()}>
                    Replace Image
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => dish1InputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors aspect-video"
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-xs font-semibold text-foreground">Upload Main Dish</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG, WebP</span>
              </div>
            )}
            <div className="text-[11px] font-medium truncate text-muted-foreground">
              {dish1.name || "No file selected"}
            </div>
          </CardContent>
        </Card>

        {/* Slot 2: Secondary Drink / Side */}
        <Card className="shadow-sm border-blue-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold flex items-center gap-1.5 text-blue-500">
                <GlassWater className="h-4 w-4" />
                2. Drink / Side Dish
              </CardTitle>
              {dish2.file && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleClearSlot("dish2")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <CardDescription className="text-[11px]">
              Oreo shake, Coffee, Fries (Right slot)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              ref={dish2InputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => handleSlotUpload("dish2", e.target.files?.[0])}
            />
            {dish2.previewUrl ? (
              <div className="relative group rounded-lg overflow-hidden border aspect-video bg-muted/30 flex items-center justify-center">
                <img src={dish2.previewUrl} alt="Dish 2" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => dish2InputRef.current?.click()}>
                    Replace Image
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => dish2InputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors aspect-video"
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-xs font-semibold text-foreground">Upload Drink / Side</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG, WebP</span>
              </div>
            )}
            <div className="text-[11px] font-medium truncate text-muted-foreground">
              {dish2.name || "No file selected"}
            </div>
          </CardContent>
        </Card>

        {/* Slot 3: Background Table Surface */}
        <Card className="shadow-sm border-emerald-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold flex items-center gap-1.5 text-emerald-500">
                <Layers className="h-4 w-4" />
                3. Table Background Surface
              </CardTitle>
              {background.file && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleClearSlot("bg")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <CardDescription className="text-[11px]">
              Wooden table, Checkerboard, Marble
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              ref={bgInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => handleSlotUpload("bg", e.target.files?.[0])}
            />
            {background.previewUrl ? (
              <div className="relative group rounded-lg overflow-hidden border aspect-video bg-muted/30 flex items-center justify-center">
                <img src={background.previewUrl} alt="Background" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => bgInputRef.current?.click()}>
                    Replace Image
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => bgInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors aspect-video"
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-xs font-semibold text-foreground">Upload Table Surface</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG, WebP</span>
              </div>
            )}
            <div className="text-[11px] font-medium truncate text-muted-foreground">
              {background.name || "No file selected"}
            </div>

            {/* Presets if available */}
            {savedBackgrounds?.length > 0 && (
              <div className="pt-2 border-t">
                <span className="text-[10px] text-muted-foreground block mb-1">Quick Select Preset:</span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {savedBackgrounds.slice(0, 4).map((bgItem) => (
                    <button
                      key={bgItem._id || bgItem.id}
                      type="button"
                      onClick={() => handleSelectPresetBackground(bgItem)}
                      className="h-8 w-12 rounded border overflow-hidden shrink-0 hover:border-emerald-500 transition-colors"
                      title={bgItem.name}
                    >
                      <img src={bgItem.image_url || bgItem.previewUrl} alt={bgItem.name} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Strategy & Prompt Controls */}
      <Card className="shadow-sm">
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-muted/40 rounded-xl border">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-foreground">Pipeline Execution Strategy</span>
              <p className="text-[11px] text-muted-foreground">
                {pipelineMode === "single_pass"
                  ? "⚡ Single-Pass: Auto-composites dishes & places them on the table in 1 pass (~120s)."
                  : "🔄 Two-Stage: Blends dishes in Stage 1, then transfers to table in Stage 2 (~450s)."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={pipelineMode === "single_pass" ? "default" : "outline"}
                className={`text-xs h-7 ${pipelineMode === "single_pass" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`}
                onClick={() => setPipelineMode("single_pass")}
              >
                ⚡ Single-Pass (~120s)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pipelineMode === "two_stage" ? "default" : "outline"}
                className={`text-xs h-7 ${pipelineMode === "two_stage" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`}
                onClick={() => setPipelineMode("two_stage")}
              >
                🔄 Two-Stage (~450s)
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Prompt & Surface Instructions
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Flux.2 Klein 4B (Euler 4 Steps)
              </span>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="text-xs font-mono leading-relaxed"
              placeholder="Enter combo composition prompt..."
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs font-normal">
                Resolution: <strong className="ml-1 text-foreground">{qualityPreset === "high" ? "0.50 MP (HQ)" : "0.38 MP (Fast ~120s)"}</strong>
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setQualityPreset(qualityPreset === "fast" ? "high" : "fast")}
              >
                Toggle {qualityPreset === "fast" ? "High Quality (0.50 MP)" : "Fast Mode (0.38 MP)"}
              </Button>
            </div>

            <Button
              onClick={handleGenerateCombo}
              disabled={isGenerating || !dish1.file || !dish2.file || !background.file}
              className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold text-xs px-6 shadow-md hover:from-orange-600 hover:to-amber-600"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Meal Combo ({progress}%)...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Meal Combo on Table
                </>
              )}
            </Button>
          </div>

          {/* Live Progress Bar */}
          {isGenerating && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-amber-500 flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {currentStepInfo}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generated Result Card */}
      {generatedResult && (
        <Card className="shadow-md border-orange-500/40 overflow-hidden">
          <CardHeader className="bg-orange-500/5 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-orange-500">
                  <CheckCircle2 className="h-4 w-4" />
                  Generated Combo Composition Result
                </CardTitle>
                <CardDescription className="text-xs">
                  Composed {generatedResult.primaryName} + {generatedResult.secondaryName} onto target background
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setCompareModalOpen(true)}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Compare Before/After
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  asChild
                >
                  <a href={generatedResult.url} download={`combo-${generatedResult.primaryName}-${generatedResult.secondaryName}.jpg`}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </a>
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-8 bg-orange-500 text-white hover:bg-orange-600"
                  onClick={handleSaveToDatabase}
                  disabled={isSavingToDb}
                >
                  {isSavingToDb ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save to S3 & Database
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col md:flex-row gap-6 items-center justify-center">
            <div className="w-full max-w-2xl rounded-xl overflow-hidden border shadow-inner bg-black/10">
              <img
                src={generatedResult.url}
                alt="Generated Meal Combo"
                className="w-full h-auto object-contain max-h-[500px]"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compare Modal */}
      {compareModalOpen && generatedResult && (
        <ImageCompareModal
          isOpen={compareModalOpen}
          onClose={() => setCompareModalOpen(false)}
          item={{
            name: `${dish1.name} + ${dish2.name} Combo`,
            previewUrl: dish1.previewUrl,
            transformedUrl: generatedResult.url,
          }}
          background={background}
        />
      )}
    </div>
  );
}
