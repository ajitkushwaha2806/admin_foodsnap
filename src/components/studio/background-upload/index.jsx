"use client";

import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, CheckCircle2, Loader2, Trash2, Bookmark } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import { toast } from "sonner";
import {
  getSavedBackgrounds,
  uploadSavedBackground,
  deleteSavedBackground,
} from "@/services/frontend/backgrounds";

export function BackgroundUpload({ background, onSetBackground, onRemoveBackground, isProcessing }) {
  const fileInputRef = useRef(null);
  const [loadingBgId, setLoadingBgId] = useState(null);
  const queryClient = useQueryClient();

  // Fetch only user-saved backgrounds from MongoDB
  const { data: savedBackgrounds = [] } = useQuery({
    queryKey: ["saved-backgrounds"],
    queryFn: getSavedBackgrounds,
  });

  // Upload and persist mutation
  const uploadMutation = useMutation({
    mutationFn: ({ file, name }) => uploadSavedBackground(file, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-backgrounds"] });
      toast.success("Background saved");
    },
    onError: (err) => {
      console.error("Failed to save background:", err);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteSavedBackground(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-backgrounds"] });
      toast.success("Background deleted");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || "Failed to delete background");
    },
  });

  const handleProcessAndSetFile = (file) => {
    const previewUrl = URL.createObjectURL(file);
    const bgName = file.name.replace(/\.[^/.]+$/, "");
    onSetBackground({
      file,
      previewUrl,
      name: bgName,
      size: file.size,
    });

    // Automatically save to database & S3
    uploadMutation.mutate({ file, name: bgName });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleProcessAndSetFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleProcessAndSetFile(file);
      e.target.value = "";
    }
  };

  const handleSelectSurface = async (item) => {
    if (isProcessing || loadingBgId) return;
    setLoadingBgId(item._id);
    try {
      const proxyUrl = item.image_url.startsWith("http")
        ? `/api/proxy-image?url=${encodeURIComponent(item.image_url)}`
        : item.image_url;
      const res = await fetch(proxyUrl);
      const blob = await res.blob();
      const file = new File([blob], `${item.name.toLowerCase().replace(/\s+/g, "_")}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      const previewUrl = URL.createObjectURL(file);
      onSetBackground({
        file,
        previewUrl,
        name: item.name,
        size: file.size,
      });
    } catch (err) {
      console.error("Failed to load surface:", err);
      toast.error("Failed to load background image");
    } finally {
      setLoadingBgId(null);
    }
  };

  const handleDeleteSaved = (e, id) => {
    e.stopPropagation();
    deleteMutation.mutate(id);
  };

  return (
    <Card className="flex flex-col h-full shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/10 text-amber-500 text-xs font-bold">
                2
              </span>
              Target Background Surface
            </CardTitle>
            {background.file ? (
              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Selected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                Required
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs mt-0.5">
            Upload custom table surface or select from your uploaded library.
          </CardDescription>
        </div>

        {background.file && !isProcessing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemoveBackground}
            className="text-destructive hover:text-destructive/80 text-xs h-8"
          >
            Change
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between gap-3">
        {background.previewUrl ? (
          <div className="relative group flex flex-col rounded-xl border bg-card p-2.5 overflow-hidden shadow-sm">
            <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
              <img
                src={background.previewUrl}
                alt={background.name}
                className="h-full w-full object-cover"
              />
              {!isProcessing && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs h-8"
                  >
                    Replace Image
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <div className="truncate pr-2">
                <p className="text-xs font-medium truncate">{background.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(background.size)}</p>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                Reference 2
              </Badge>
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-5 text-center hover:border-amber-500/50 hover:bg-amber-500/[0.02] cursor-pointer transition-all ${
              isProcessing ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-amber-500 group-hover:scale-105 group-hover:bg-amber-500/20 transition-all">
              <Layers className="h-5 w-5" />
            </div>
            <p className="mt-2 text-xs font-medium">
              Drop background image here, or <span className="text-amber-500 underline">browse</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Uploaded backgrounds auto-save to your library</p>
          </div>
        )}

        {/* Saved Backgrounds Section (Only User Uploads) */}
        {savedBackgrounds.length > 0 && (
          <div className="pt-2 border-t space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bookmark className="w-3 h-3 text-amber-500" /> Saved Backgrounds ({savedBackgrounds.length})
              </span>
              {uploadMutation.isPending && (
                <span className="text-[10px] text-amber-500 flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving...
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 max-h-[170px] overflow-y-auto pr-0.5">
              {savedBackgrounds.map((surface) => {
                const isSelected = background.name === surface.name;
                const isLoadingThis = loadingBgId === surface._id;

                return (
                  <div
                    key={surface._id}
                    onClick={() => handleSelectSurface(surface)}
                    className={`group relative rounded-lg overflow-hidden border p-1 text-left cursor-pointer transition-all hover:border-amber-500/60 ${
                      isSelected
                        ? "border-amber-500 ring-1 ring-amber-500 bg-amber-500/[0.05]"
                        : "bg-muted/40"
                    }`}
                  >
                    <div className="aspect-[16/9] w-full rounded overflow-hidden bg-muted mb-1 relative">
                      <img
                        src={surface.image_url}
                        alt={surface.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />

                      {/* Delete Icon Top Right */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSaved(e, surface._id)}
                        className="absolute top-1 right-1 h-5 w-5 rounded bg-destructive/90 text-destructive-foreground hover:bg-destructive opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm z-10"
                        title="Delete background"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>

                      {/* Loading Indicator */}
                      {isLoadingThis && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                          <Loader2 className="w-3 h-3 animate-spin text-white" />
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] font-medium leading-tight truncate" title={surface.name}>
                      {surface.name}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
      </CardContent>
    </Card>
  );
}
