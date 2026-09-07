"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProducts } from "@/services/frontend/products";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { ZomatoScraperPopover } from "@/components/zomato/scraper-popover";
import {
  Search,
  CheckSquare,
  Square,
  Sparkles,
  UtensilsCrossed,
  RefreshCw,
  Layers,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductImportModal({ isOpen, onClose, onImportToStudio }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dietaryFilter, setDietaryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(24);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["products-for-studio", { search, categoryFilter, dietaryFilter, page, limit }],
    queryFn: () =>
      getProducts({
        search: search || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        dietaryType: dietaryFilter !== "all" ? dietaryFilter : undefined,
        page,
        limit,
      }),
    enabled: isOpen,
  });

  const products = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;
  const totalCount = data?.pagination?.total || 0;
  const categories = data?.categories || [];

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    const pageIds = products.map((p) => p._id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleQueueSelected = () => {
    const selectedProducts = products.filter((p) => selectedIds.has(p._id));
    const formattedItems = selectedProducts.map((p) => ({
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

    onImportToStudio(formattedItems);
    onClose();
  };

  const isPageFullySelected =
    products.length > 0 && products.every((p) => selectedIds.has(p._id));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-primary">
              <UtensilsCrossed className="w-5 h-5 text-orange-500" />
              <DialogTitle>Import Dishes from Scraped Products</DialogTitle>
            </div>
            <ZomatoScraperPopover
              buttonVariant="outline"
              buttonSize="sm"
              onSuccess={() => refetch()}
            />
          </div>
          <DialogDescription>
            Select scraped dishes from your database to load into the AI processor queue in batches.
          </DialogDescription>
        </DialogHeader>

        {/* Filters and Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 py-2 border-b">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search scraped items..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(val) => {
                setCategoryFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-xs w-[130px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={dietaryFilter}
              onValueChange={(val) => {
                setDietaryFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-xs w-[100px]">
                <SelectValue placeholder="Diet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Diets</SelectItem>
                <SelectItem value="veg">Veg Only</SelectItem>
                <SelectItem value="non_veg">Non-Veg</SelectItem>
                <SelectItem value="egg">Egg</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={String(limit)}
              onValueChange={(val) => {
                setLimit(Number(val));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 text-xs w-[100px]">
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12 / page</SelectItem>
                <SelectItem value="24">24 / page</SelectItem>
                <SelectItem value="48">48 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectPage}
              className="text-xs h-8 gap-1.5"
            >
              {isPageFullySelected ? (
                <CheckSquare className="h-3.5 w-3.5 text-orange-500" />
              ) : (
                <Square className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              {isPageFullySelected ? "Deselect Page" : `Select Page (${products.length})`}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 w-8"
              title="Refresh list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto py-2 min-h-[300px] max-h-[400px] pr-1">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl p-4">
              <Layers className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-xs font-semibold">No scraped products found</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Import dishes using the Zomato Scraper above or upload image files directly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {products.map((item) => {
                const isSelected = selectedIds.has(item._id);

                return (
                  <div
                    key={item._id}
                    onClick={() => toggleSelect(item._id)}
                    className={`group relative flex flex-col rounded-xl border p-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-orange-500/80 bg-orange-500/[0.04] shadow-sm"
                        : "bg-card hover:border-muted-foreground/40"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />

                      {/* Select Indicator */}
                      <div className="absolute top-1.5 left-1.5 z-10">
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-md border text-white text-xs ${
                            isSelected
                              ? "bg-orange-600 border-orange-500"
                              : "bg-black/60 border-white/20 backdrop-blur-sm"
                          }`}
                        >
                          {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
                        </div>
                      </div>

                      {/* Dietary Dot */}
                      {item.dietaryType && item.dietaryType !== "unknown" && (
                        <div className="absolute top-1.5 right-1.5 z-10">
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border text-[9px] font-bold ${
                              item.dietaryType === "veg"
                                ? "border-emerald-500 bg-emerald-950/80 text-emerald-400"
                                : "border-rose-500 bg-rose-950/80 text-rose-400"
                            }`}
                          >
                            ●
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <div className="mt-2 flex flex-col gap-0.5">
                      <span className="text-xs font-semibold truncate" title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {item.category || "Scraped Dish"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center px-1 py-1 border-t text-xs text-muted-foreground">
            <span>
              Showing {products.length} of {totalCount} dishes
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-3 flex flex-row items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} dish{selectedIds.size === 1 ? "" : "es"} selected
          </span>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleQueueSelected}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Load {selectedIds.size} into AI Queue
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


