"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getProducts, deleteProduct } from "@/services/frontend/products";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Trash2,
  Layers,
  Sparkles,
  Soup,
  UtensilsCrossed,
  Square,
  CheckSquare,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dietaryFilter, setDietaryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(24);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["products", { search, categoryFilter, dietaryFilter, page, limit }],
    queryFn: () =>
      getProducts({
        search: search || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        dietaryType: dietaryFilter !== "all" ? dietaryFilter : undefined,
        page,
        limit,
      }),
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

  const handleProcessPage = () => {
    if (products.length === 0) {
      toast.error("No products on this page to process");
      return;
    }
    const pageIds = products.map((p) => p._id).join(",");
    const params = new URLSearchParams({
      ids: pageIds,
      mode: "page",
      page: String(page),
      limit: String(limit),
      autostart: "true",
    });
    if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
    if (dietaryFilter && dietaryFilter !== "all") params.set("dietaryType", dietaryFilter);
    if (search) params.set("search", search);
    router.push(`/processor?${params.toString()}`);
  };

  const handleProcessAll = () => {
    if (totalCount === 0) {
      toast.error("No products found to process");
      return;
    }
    const params = new URLSearchParams({
      mode: "all",
      limit: "500",
      autostart: "true",
    });
    if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
    if (dietaryFilter && dietaryFilter !== "all") params.set("dietaryType", dietaryFilter);
    if (search) params.set("search", search);
    router.push(`/processor?${params.toString()}`);
  };

  const handleProcessSelected = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one product");
      return;
    }
    const ids = Array.from(selectedIds).join(",");
    const params = new URLSearchParams({
      ids,
      mode: "selected",
      autostart: "true",
    });
    if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
    if (dietaryFilter && dietaryFilter !== "all") params.set("dietaryType", dietaryFilter);
    if (search) params.set("search", search);
    router.push(`/processor?${params.toString()}`);
  };

  const handleDelete = async (id, name) => {
    try {
      await deleteProduct(id);
      toast.success(`Deleted ${name || "product"}`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refetch();
    } catch (err) {
      toast.error("Failed to delete product");
    }
  };

  const isPageFullySelected =
    products.length > 0 && products.every((p) => selectedIds.has(p._id));

  return (
    <div className="space-y-4">
      {/* Filters & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-3 rounded-xl border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search dish name or description..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={dietaryFilter}
            onValueChange={(val) => {
              setDietaryFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="Dietary Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Diets</SelectItem>
              <SelectItem value="veg">🌱 Vegetarian</SelectItem>
              <SelectItem value="non-veg">🍗 Non-Veg</SelectItem>
            </SelectContent>
          </Select>

          {categories.length > 0 && (
            <Select
              value={categoryFilter}
              onValueChange={(val) => {
                setCategoryFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Limit selector */}
          <Select
            value={String(limit)}
            onValueChange={(val) => {
              setLimit(Number(val));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-24 h-9 text-xs">
              <SelectValue placeholder="Per Page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">12 / page</SelectItem>
              <SelectItem value="24">24 / page</SelectItem>
              <SelectItem value="48">48 / page</SelectItem>
              <SelectItem value="96">96 / page</SelectItem>
            </SelectContent>
          </Select>

          {/* Process Batch Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Primary Action: Process Current Page */}
            <Button
              size="sm"
              onClick={selectedIds.size > 0 ? handleProcessSelected : handleProcessPage}
              disabled={products.length === 0}
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-medium text-xs h-9 gap-1.5 shadow-sm"
              title={selectedIds.size > 0 ? `Process ${selectedIds.size} selected dishes` : `Process ${products.length} dishes on this page`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {selectedIds.size > 0
                ? `Process Selected (${selectedIds.size})`
                : `Process Page ${page} (${products.length})`}
            </Button>

            {/* Process All Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleProcessAll}
              disabled={totalCount === 0}
              className="text-xs h-9 gap-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
              title={`Queue all ${totalCount} products across all pages`}
            >
              <Layers className="w-3.5 h-3.5" />
              Process All ({totalCount})
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Selection Summary & Page Info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSelectPage}
            className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {isPageFullySelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {isPageFullySelected ? "Deselect Page" : "Select Page"}
          </Button>

          {selectedIds.size > 0 && (
            <span className="text-orange-400 font-medium">
              {selectedIds.size} dish{selectedIds.size === 1 ? "" : "es"} selected
            </span>
          )}

          <span>
            Showing <strong className="text-foreground">{products.length}</strong> of{" "}
            <strong className="text-foreground">{totalCount}</strong> products
          </span>
        </div>

        <span>
          Page <strong>{page}</strong> of <strong>{totalPages}</strong>
        </span>
      </div>

      {/* 4 In A Row Card Grid Layout */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-3 border rounded-xl bg-card space-y-2">
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((prod) => {
            const isSelected = selectedIds.has(prod._id);

            return (
              <Card
                key={prod._id}
                className={`group p-3 rounded-xl border bg-card hover:shadow-md transition-all duration-200 space-y-2 flex flex-col cursor-pointer ${isSelected ? "border-orange-500/80 bg-orange-500/[0.03] shadow-sm" : ""
                  }`}
                onClick={() => toggleSelect(prod._id)}
              >
                {/* Product Image Thumbnail */}
                <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-muted/40">
                  {prod.image_url ? (
                    <img
                      src={prod.image_url}
                      alt={prod.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/60 bg-muted/20">
                      <Soup className="w-6 h-6 mb-1 opacity-50" />
                      <span className="text-[10px]">No photo</span>
                    </div>
                  )}

                  {/* Select Checkbox Top Left */}
                  <div
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(prod._id);
                    }}
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border text-white text-xs transition-colors ${isSelected
                          ? "bg-orange-600 border-orange-500"
                          : "bg-black/60 border-white/20 backdrop-blur-sm opacity-70 group-hover:opacity-100"
                        }`}
                    >
                      {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
                    </div>
                  </div>

                  {/* Single AI Process Button Bottom Right */}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-2 right-2 h-7 px-2 text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md bg-background/90 text-orange-500 hover:text-orange-600 backdrop-blur-sm gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/processor?productId=${prod._id}&autostart=true`);
                    }}
                    title="Process single dish"
                  >
                    <Sparkles className="w-3 h-3" />
                    Process
                  </Button>

                  {/* Delete Icon Button Top Right */}
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md bg-red-600/90 hover:bg-red-600 text-white backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(prod._id, prod.name);
                    }}
                    title="Delete product"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Name & Category */}
                <div className="flex flex-col gap-0.5">
                  <h4
                    className="font-semibold text-xs truncate text-foreground group-hover:text-primary transition-colors"
                    title={prod.name}
                  >
                    {prod.name}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="truncate">{prod.category || "General"}</span>
                    {prod.dietaryType && prod.dietaryType !== "unknown" && (
                      <span
                        className={`font-semibold ${prod.dietaryType === "veg" ? "text-emerald-500" : "text-rose-500"
                          }`}
                      >
                        ● {prod.dietaryType}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center border rounded-2xl bg-card flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">No products found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              Use the &quot;Import from Zomato&quot; button above to scrape restaurant menus with photos.
            </p>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default ProductTable;
