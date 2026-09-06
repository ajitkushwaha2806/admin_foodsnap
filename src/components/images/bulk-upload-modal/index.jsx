"use client";

import React, { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Trash2,
  Image as ImageIcon,
  RotateCcw,
} from "lucide-react";
import { bulkUploadWithAi } from "@/services/frontend/images";

export function BulkUploadModal({ open, onOpenChange, onSuccess }) {
  const [items, setItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const handleAddFiles = useCallback((fileList) => {
    const validFiles = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/")
    );

    if (validFiles.length === 0) {
      toast.error("Please select valid image files (PNG, JPG, WEBP)");
      return;
    }

    const newItems = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
      previewUrl: URL.createObjectURL(file),
      status: "idle", // 'idle' | 'analyzing' | 'uploading' | 'completed' | 'error'
      progress: 0,
      result: null,
      error: null,
    }));

    setItems((prev) => [...prev, ...newItems]);
    toast.success(`Added ${newItems.length} image(s) to queue`);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveItem = (id) => {
    setItems((prev) => {
      const itemToRemove = prev.find((i) => i.id === id);
      if (itemToRemove?.previewUrl) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const handleClearAll = () => {
    items.forEach((i) => {
      if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    });
    setItems([]);
  };

  const handleClearCompleted = () => {
    setItems((prev) => {
      prev.filter((i) => i.status === "completed").forEach((i) => {
        if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      });
      return prev.filter((i) => i.status !== "completed");
    });
  };

  const processBatch = async () => {
    const pendingItems = items.filter(
      (i) => i.status === "idle" || i.status === "error"
    );

    if (pendingItems.length === 0) {
      toast.info("No pending images to upload.");
      return;
    }

    setIsProcessing(true);
    let completedCount = 0;

    // Process concurrently with a pool of 2 workers
    const concurrencyLimit = 2;
    const queue = [...pendingItems];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        // Update to analyzing
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "analyzing", progress: 25, error: null }
              : i
          )
        );

        try {
          // Progress simulation to uploading
          setTimeout(() => {
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id && i.status === "analyzing"
                  ? { ...i, status: "uploading", progress: 65 }
                  : i
              )
            );
          }, 1500);

          const res = await bulkUploadWithAi(item.file);

          if (res?.success) {
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: "completed",
                      progress: 100,
                      result: res.data,
                    }
                  : i
              )
            );
            completedCount++;
          } else {
            throw new Error(res?.error || "Failed to process image");
          }
        } catch (err) {
          const errMsg = err?.response?.data?.error || err.message || "Upload failed";
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "error", progress: 0, error: errMsg }
                : i
            )
          );
        }
      }
    };

    const workers = Array.from({ length: concurrencyLimit }).map(() => worker());
    await Promise.all(workers);

    setIsProcessing(false);
    if (completedCount > 0) {
      toast.success(`Successfully uploaded and tagged ${completedCount} image(s)!`);
      if (onSuccess) onSuccess();
    }
  };

  const completedCount = items.filter((i) => i.status === "completed").length;
  const totalCount = items.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(val) => !isProcessing && onOpenChange(val)}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Bulk AI Image Drop & Auto-Tagging
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Drop multiple transformed food images. Amazon Bedrock (Nova Vision) will analyze the dishes, generate titles, descriptions, categories, tags, and save them directly to FoodSnap Studio.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2.5 ${
              isDragging
                ? "border-primary bg-primary/5 scale-[0.99]"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/jpg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleAddFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">
                Click or drag & drop transformed food images here
              </p>
              <p className="text-xs text-muted-foreground">
                Supports PNG, JPG, JPEG, WEBP (Batch processing with Amazon Nova AI)
              </p>
            </div>
          </div>

          {/* Queue Statistics & Progress */}
          {items.length > 0 && (
            <div className="space-y-2 bg-muted/30 p-3 rounded-lg border">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  Queue: {completedCount} / {totalCount} Processed
                </span>
                <div className="flex items-center gap-2">
                  {completedCount > 0 && !isProcessing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearCompleted}
                      className="h-7 text-[11px] text-muted-foreground"
                    >
                      Clear Completed
                    </Button>
                  )}
                  {!isProcessing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAll}
                      className="h-7 text-[11px] text-destructive hover:text-destructive"
                    >
                      Clear All
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}

          {/* Item List */}
          {items.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    item.status === "completed"
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : item.status === "error"
                      ? "bg-red-500/5 border-red-500/30"
                      : "bg-card"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="w-14 h-11 object-cover rounded-lg border flex-shrink-0 bg-muted/40"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-semibold truncate">
                          {item.result?.title || item.name}
                        </h5>
                        {item.result?.food_type && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 py-0 ${
                              item.result.food_type === "veg"
                                ? "text-emerald-500 border-emerald-500/40"
                                : "text-red-500 border-red-500/40"
                            }`}
                          >
                            {item.result.food_type === "veg" ? "🌱 Veg" : "🍗 Non-Veg"}
                          </Badge>
                        )}
                      </div>

                      {item.result ? (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {item.result.category} • {item.result.cuisine || "Continental"} •{" "}
                          {item.result.description}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          {item.size} • {item.name}
                        </p>
                      )}

                      {item.error && (
                        <p className="text-[11px] text-destructive font-medium">
                          Error: {item.error}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.status === "idle" && (
                      <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                        Ready
                      </Badge>
                    )}

                    {item.status === "analyzing" && (
                      <div className="flex items-center gap-1.5 text-amber-500 text-xs font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing Nova...</span>
                      </div>
                    )}

                    {item.status === "uploading" && (
                      <div className="flex items-center gap-1.5 text-blue-500 text-xs font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading S3...</span>
                      </div>
                    )}

                    {item.status === "completed" && (
                      <div className="flex items-center gap-1 text-emerald-500 text-xs font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Saved</span>
                      </div>
                    )}

                    {item.status === "error" && (
                      <div className="flex items-center gap-1 text-red-500 text-xs font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        <span>Failed</span>
                      </div>
                    )}

                    {!isProcessing && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {items.length > 0 && `${items.length} items in queue`}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              {completedCount > 0 ? "Done" : "Cancel"}
            </Button>

            <Button
              size="sm"
              onClick={processBatch}
              disabled={
                isProcessing ||
                items.filter((i) => i.status === "idle" || i.status === "error").length === 0
              }
              className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Nova AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    Process & Save ({items.filter((i) => i.status === "idle" || i.status === "error").length})
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BulkUploadModal;
