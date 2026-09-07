"use client";

import React, { useRef, useState, useMemo } from "react";
import {
  UploadCloud,
  ImageIcon,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UtensilsCrossed,
  Search,
  Filter,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes } from "@/lib/utils";

export function SubjectBatchUpload({
  items,
  onAddFiles,
  onRemoveItem,
  onClearAll,
  onOpenProductImport,
  isProcessing,
}) {
  const fileInputRef = useRef(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).filter(Boolean);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterCategory !== "all" && item.category !== filterCategory) {
        return false;
      }
      if (filterSearch) {
        const query = filterSearch.toLowerCase();
        const matchesName = item.name?.toLowerCase().includes(query);
        const matchesCategory = item.category?.toLowerCase().includes(query);
        if (!matchesName && !matchesCategory) return false;
      }
      return true;
    });
  }, [items, filterCategory, filterSearch]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  return (
    <Card className="flex flex-col h-full shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500/10 text-orange-500 text-xs font-bold">
                1
              </span>
              Subject Dishes Queue
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[11px] px-1.5 py-0">
              {items.length} {items.length === 1 ? "dish" : "dishes"}
            </Badge>
          </div>
          <CardDescription className="text-xs mt-0.5">
            Upload local food images or import from scraped restaurant menus.
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenProductImport}
            disabled={isProcessing}
            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs h-8"
          >
            <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5 text-orange-500" />
            Import Scraped Products
          </Button>

          {items.length > 0 && !isProcessing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-destructive hover:text-destructive/80 text-xs h-8"
            >
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* Dropzone Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`relative group flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all cursor-pointer ${
            items.length === 0
              ? "py-8 border-muted-foreground/30 bg-muted/20 hover:border-orange-500/50 hover:bg-orange-500/[0.02]"
              : "py-3 border-muted-foreground/20 bg-muted/10 hover:border-muted-foreground/40"
          } ${isProcessing ? "opacity-60 pointer-events-none" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-orange-500 group-hover:scale-105 group-hover:bg-orange-500/20 transition-all">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium">
                Drag & drop dish photos here, or <span className="text-orange-500 underline">browse</span>
              </p>
              <p className="text-[10px] text-muted-foreground">Supports PNG, JPG, WEBP</p>
            </div>
          </div>
        </div>

        {/* Filter Toolbar when items exist */}
        {items.length > 4 && (
          <div className="flex items-center gap-2 pt-1">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter queue by dish name..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>

            {categories.length > 0 && (
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-7 text-xs w-[140px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories ({items.length})</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat} ({items.filter((i) => i.category === cat).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Uploaded Grid List */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[440px] overflow-y-auto pr-1">
            {filteredItems.map((item, index) => {
              const statusBadges = {
                idle: (
                  <Badge variant="secondary" className="text-[9px] py-0 px-1">
                    Ready
                  </Badge>
                ),
                uploading: (
                  <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-500 border-amber-500/30">
                    <Loader2 className="h-2 w-2 animate-spin mr-0.5" /> Uploading
                  </Badge>
                ),
                queued: (
                  <Badge variant="outline" className="text-[9px] py-0 px-1 text-orange-500 border-orange-500/30">
                    <Loader2 className="h-2 w-2 animate-spin mr-0.5" /> Queued
                  </Badge>
                ),
                processing: (
                  <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-500 border-amber-500/30 bg-amber-500/10">
                    <Loader2 className="h-2 w-2 animate-spin mr-0.5" /> {item.progress || 0}%
                  </Badge>
                ),
                completed: (
                  <Badge variant="outline" className="text-[9px] py-0 px-1 text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                    <CheckCircle2 className="h-2 w-2 mr-0.5" /> Done
                  </Badge>
                ),
                error: (
                  <Badge variant="destructive" className="text-[9px] py-0 px-1">
                    <AlertCircle className="h-2 w-2 mr-0.5" /> Failed
                  </Badge>
                ),
              };

              const imageSrc = item.previewUrl || item.originalUrl || item.outputImageUrl;

              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col rounded-xl border bg-card p-2 overflow-hidden shadow-sm hover:border-muted-foreground/40 transition-all"
                >
                  {/* Image Container */}
                  <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={item.name || "Dish"}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-6 w-6 mb-1" />
                        <span className="text-[9px]">No preview</span>
                      </div>
                    )}

                    {/* Index Overlay */}
                    <div className="absolute top-1.5 left-1.5 z-10 flex h-4 w-4 items-center justify-center rounded bg-black/75 text-[9px] font-bold text-white backdrop-blur-sm">
                      #{index + 1}
                    </div>

                    {/* Status Badge */}
                    <div className="absolute bottom-1.5 left-1.5 z-10 scale-90 origin-bottom-left">
                      {statusBadges[item.status] || statusBadges.idle}
                    </div>

                    {/* Remove Action */}
                    {!isProcessing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveItem(item.id);
                        }}
                        className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all shadow-sm"
                        title="Remove dish"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Caption & Metadata */}
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <span className="text-xs font-semibold truncate" title={item.name}>
                      {item.name || "Untitled Dish"}
                    </span>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate">{item.category || (item.size > 0 ? formatBytes(item.size) : "Dish Photo")}</span>
                      {item.food_type && item.food_type !== "unknown" && (
                        <span className={`text-[9px] font-bold ${item.food_type === "veg" ? "text-emerald-500" : "text-rose-500"}`}>
                          ● {item.food_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
