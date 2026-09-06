"use client";

import React, { useState, useRef, useCallback } from "react";
import { Download, Columns, SplitSquareVertical, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { saveAs } from "file-saver";

function ImageCompareSlider({
  beforeImage,
  afterImage,
  beforeLabel = "Original Dish",
  afterLabel = "AI Transformed",
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPosition(percent);
  }, []);

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none overflow-hidden rounded-xl border bg-muted/40 aspect-[4/3] w-full max-h-[500px] flex items-center justify-center cursor-ew-resize"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {/* Transformed Image (Base Layer) */}
      <img
        src={afterImage}
        alt={afterLabel}
        className="absolute inset-0 h-full w-full object-contain pointer-events-none"
      />
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 backdrop-blur-md border border-emerald-500/30">
        <Sparkles className="h-3 w-3" />
        {afterLabel}
      </div>

      {/* Original Image (Clipped Overlay) */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img
          src={beforeImage}
          alt={beforeLabel}
          className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        />
        <div className="absolute top-3 left-3 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 backdrop-blur-md border border-white/10">
          {beforeLabel}
        </div>
      </div>

      {/* Slider Divider Line */}
      <div
        className="absolute top-0 bottom-0 z-20 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onTouchStart={() => setIsDragging(true)}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-900 shadow-xl border border-zinc-300 cursor-ew-resize hover:scale-110 active:scale-95 transition-transform">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function ImageCompareModal({ item, isOpen, onClose }) {
  const [viewMode, setViewMode] = useState("slider"); // 'slider' | 'side-by-side'

  if (!item || !item.outputImageUrl) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(item.outputImageUrl);
      const blob = await response.blob();
      saveAs(blob, `ai-transformed-${item.name.replace(/[/\\?%*:|"<>]/g, "_")}.png`);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const beforeSrc = item.previewUrl || item.originalUrl || item.image_url;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-base truncate">{item.name}</DialogTitle>
              <DialogDescription className="text-xs">
                Transformed output {item.executionTimeSec ? `• Generated in ${item.executionTimeSec.toFixed(1)}s` : ""}
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1 border">
                <button
                  onClick={() => setViewMode("slider")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "slider"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                  Slider
                </button>
                <button
                  onClick={() => setViewMode("side-by-side")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "side-by-side"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Columns className="h-3.5 w-3.5" />
                  Side by Side
                </button>
              </div>

              <Button size="sm" onClick={handleDownload} className="h-8 text-xs">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          {viewMode === "slider" ? (
            <ImageCompareSlider
              beforeImage={beforeSrc}
              afterImage={item.outputImageUrl}
              beforeLabel="Original Dish"
              afterLabel="Flux.2 Klein Output"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Original Input</span>
                <div className="rounded-xl overflow-hidden border bg-muted/30 aspect-square flex items-center justify-center p-2">
                  <img
                    src={beforeSrc}
                    alt="Original"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-emerald-500">AI Transformed Output</span>
                <div className="rounded-xl overflow-hidden border border-emerald-500/30 bg-muted/30 aspect-square flex items-center justify-center p-2 shadow-sm">
                  <img
                    src={item.outputImageUrl}
                    alt="Transformed"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
