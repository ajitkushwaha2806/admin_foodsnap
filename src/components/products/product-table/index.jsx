"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getProducts, deleteProduct, deleteProducts } from "@/services/frontend/products";
import { getJobs } from "@/services/frontend/jobs";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import axios from "axios";
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
  AlertTriangle,
  ArrowDownAZ,
  Zap,
  Clock,
  CheckCircle2,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dietaryFilter, setDietaryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(24);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["products", { search, categoryFilter, dietaryFilter, sortBy, page, limit }],
    queryFn: () =>
      getProducts({
        search: search || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        dietaryType: dietaryFilter !== "all" ? dietaryFilter : undefined,
        sortBy,
        page,
        limit,
      }),
  });

  // Real-time query for active & waiting BullMQ jobs (polls every 3 seconds)
  const { data: queueData } = useQuery({
    queryKey: ["bullmq-live-status-map"],
    queryFn: () => getJobs({ status: "all", limit: 300 }),
    refetchInterval: 3000,
  });

  const jobsByProductId = React.useMemo(() => {
    const map = {};
    if (queueData?.jobs) {
      queueData.jobs.forEach((job) => {
        const prodId = job.data?.productId || job.data?._id;
        if (prodId) {
          if (!map[prodId] || job.state === "active" || job.state === "waiting") {
            map[prodId] = job;
          }
        }
      });
    }
    return map;
  }, [queueData]);

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
    if (sortBy) params.set("sortBy", sortBy);
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
    if (sortBy) params.set("sortBy", sortBy);
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
    if (sortBy) params.set("sortBy", sortBy);
    router.push(`/processor?${params.toString()}`);
  };

  const [isQueueing, setIsQueueing] = useState(false);

  const handleQueueSelectedBullMQ = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one product");
      return;
    }
    const selectedProducts = products.filter((p) => selectedIds.has(p._id));
    if (selectedProducts.length === 0) return;

    try {
      setIsQueueing(true);
      const items = selectedProducts.map((p) => ({
        productId: p._id,
        name: p.name,
        description: p.description,
        category: p.category,
        sub_category: p.sub_category,
        dietaryType: p.dietaryType,
        image_url: p.image_url,
      }));

      const res = await axios.post("/api/jobs", { items });
      toast.success(res.data.message || `Queued ${items.length} dishes in background!`, {
        action: {
          label: "View Queue",
          onClick: () => router.push("/jobs"),
        },
      });
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Failed to queue dishes");
    } finally {
      setIsQueueing(false);
    }
  };

  const handleQueuePageBullMQ = async () => {
    if (products.length === 0) {
      toast.error("No products on this page to queue");
      return;
    }

    try {
      setIsQueueing(true);
      const items = products.map((p) => ({
        productId: p._id,
        name: p.name,
        description: p.description,
        category: p.category,
        sub_category: p.sub_category,
        dietaryType: p.dietaryType,
        image_url: p.image_url,
      }));

      const res = await axios.post("/api/jobs", { items });
      toast.success(res.data.message || `Queued ${items.length} dishes on page ${page}!`, {
        action: {
          label: "View Queue",
          onClick: () => router.push("/jobs"),
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Failed to queue dishes");
    } finally {
      setIsQueueing(false);
    }
  };

  const handleQueueSingleBullMQ = async (prod, e) => {
    e?.stopPropagation();
    try {
      const res = await axios.post("/api/jobs", {
        item: {
          productId: prod._id,
          name: prod.name,
          description: prod.description,
          category: prod.category,
          sub_category: prod.sub_category,
          dietaryType: prod.dietaryType,
          image_url: prod.image_url,
        },
      });
      toast.success(res.data.message || `Queued "${prod.name}" in background!`, {
        action: {
          label: "View Queue",
          onClick: () => router.push("/jobs"),
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Failed to queue dish");
    }
  };

  const [isDeletePageDialogOpen, setIsDeletePageDialogOpen] = useState(false);
  const [isDeletingPage, setIsDeletingPage] = useState(false);
  const [isDeleteSelectedDialogOpen, setIsDeleteSelectedDialogOpen] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

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

  const handleDeletePage = async () => {
    if (products.length === 0) {
      toast.error("No products on this page to delete");
      return;
    }
    const pageIds = products.map((p) => p._id);
    setIsDeletingPage(true);
    try {
      const res = await deleteProducts(pageIds);
      toast.success(res.message || `Deleted ${pageIds.length} products from page ${page}`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
      setIsDeletePageDialogOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete page products");
    } finally {
      setIsDeletingPage(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error("No products selected to delete");
      return;
    }
    const idsToDelete = Array.from(selectedIds);
    setIsDeletingSelected(true);
    try {
      const res = await deleteProducts(idsToDelete);
      toast.success(res.message || `Deleted ${idsToDelete.length} selected products`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      setIsDeleteSelectedDialogOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete selected products");
    } finally {
      setIsDeletingSelected(false);
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

          {/* Sort By selector */}
          <Select
            value={sortBy}
            onValueChange={(val) => {
              setSortBy(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">🔤 Name (A - Z)</SelectItem>
              <SelectItem value="name_desc">🔤 Name (Z - A)</SelectItem>
              <SelectItem value="newest">🕒 Newest First</SelectItem>
              <SelectItem value="oldest">🕒 Oldest First</SelectItem>
            </SelectContent>
          </Select>

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
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* BullMQ Background Queue Button */}
            <Button
              size="sm"
              onClick={selectedIds.size > 0 ? handleQueueSelectedBullMQ : handleQueuePageBullMQ}
              disabled={products.length === 0 || isQueueing}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs h-9 gap-1.5 shadow-sm"
              title={
                selectedIds.size > 0
                  ? `Queue ${selectedIds.size} selected dishes to BullMQ background worker`
                  : `Queue ${products.length} dishes on this page to BullMQ background worker`
              }
            >
              <Zap className={`w-3.5 h-3.5 ${isQueueing ? "animate-spin" : ""}`} />
              {isQueueing
                ? "Queueing..."
                : selectedIds.size > 0
                ? `⚡ Queue Selected (${selectedIds.size})`
                : `⚡ Queue Page ${page} (${products.length})`}
            </Button>

            {/* Live Studio Process Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={selectedIds.size > 0 ? handleProcessSelected : handleProcessPage}
              disabled={products.length === 0}
              className="text-xs h-9 gap-1.5 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
              title={selectedIds.size > 0 ? `Open ${selectedIds.size} dishes in live AI studio` : `Open page in live AI studio`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {selectedIds.size > 0
                ? `Live Studio (${selectedIds.size})`
                : `Live Studio (${products.length})`}
            </Button>

            {/* Process All Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleProcessAll}
              disabled={totalCount === 0}
              className="text-xs h-9 gap-1 text-muted-foreground hover:text-foreground"
              title={`Open all ${totalCount} products across all pages in Studio`}
            >
              <Layers className="w-3.5 h-3.5" />
              Studio All ({totalCount})
            </Button>

            {/* Delete Buttons */}
            {selectedIds.size > 0 ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setIsDeleteSelectedDialogOpen(true)}
                  disabled={isDeletingSelected}
                  className="text-xs h-9 gap-1 bg-rose-600 hover:bg-rose-700 text-white shadow-sm font-medium"
                  title={`Delete ${selectedIds.size} selected products`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected ({selectedIds.size})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsDeletePageDialogOpen(true)}
                  disabled={products.length === 0 || isDeletingPage}
                  className="text-xs h-9 gap-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  title={`Delete all ${products.length} products on page ${page}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Page
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsDeletePageDialogOpen(true)}
                disabled={products.length === 0 || isDeletingPage}
                className="text-xs h-9 gap-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/50"
                title={`Delete all ${products.length} products on page ${page}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Page ({products.length})
              </Button>
            )}

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
        <div className="flex items-center gap-3 flex-wrap">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDeleteSelectedDialogOpen(true)}
              disabled={isDeletingSelected}
              className="h-7 px-2 text-xs gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-semibold"
              title={`Delete ${selectedIds.size} selected products`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}

          {products.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDeletePageDialogOpen(true)}
              disabled={isDeletingPage}
              className="h-7 px-2 text-xs gap-1.5 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10"
              title={`Delete all ${products.length} products on page ${page}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Page
            </Button>
          )}

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
            const liveJob = jobsByProductId[prod._id];
            const status = liveJob
              ? liveJob.state
              : prod.process_status || (prod.processed ? "completed" : "idle");

            const aiPhotoUrl = prod.ai_image_url || liveJob?.returnvalue?.imageUrl || liveJob?.returnvalue?.optimisedUrl;

            return (
              <Card
                key={prod._id}
                className={`group p-3 rounded-xl border bg-card hover:shadow-md transition-all duration-200 space-y-2 flex flex-col cursor-pointer ${
                  isSelected ? "border-orange-500/80 bg-orange-500/[0.03] shadow-sm" : ""
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
                      className={`flex h-5 w-5 items-center justify-center rounded-md border text-white text-xs transition-colors ${
                        isSelected
                          ? "bg-orange-600 border-orange-500"
                          : "bg-black/60 border-white/20 backdrop-blur-sm opacity-70 group-hover:opacity-100"
                      }`}
                    >
                      {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
                    </div>
                  </div>

                  {/* Status Overlay Badge Top Right */}
                  {status === "active" && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-amber-500 text-white font-semibold text-[10px] py-0.5 px-2 rounded-full border border-amber-300 shadow-md flex items-center gap-1.5 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        Processing {typeof liveJob?.progress === "number" ? `${liveJob.progress}%` : ""}
                      </Badge>
                    </div>
                  )}

                  {(status === "waiting" || status === "queued") && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-blue-600 text-white font-semibold text-[10px] py-0.5 px-2 rounded-full border border-blue-400 shadow-md flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        Queued
                      </Badge>
                    </div>
                  )}

                  {(status === "completed" || prod.processed) && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-emerald-600 text-white font-semibold text-[10px] py-0.5 px-2 rounded-full border border-emerald-400 shadow-md flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        AI Processed
                      </Badge>
                    </div>
                  )}

                  {status === "failed" && (
                    <div className="absolute top-2 right-2 z-10">
                      <Badge className="bg-rose-600 text-white font-semibold text-[10px] py-0.5 px-2 rounded-full border border-rose-400 shadow-md flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Failed
                      </Badge>
                    </div>
                  )}

                  {/* Single AI Actions Bottom Right */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                    {aiPhotoUrl ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[10px] rounded-lg shadow-md bg-emerald-600 hover:bg-emerald-700 text-white backdrop-blur-sm gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(aiPhotoUrl, "_blank");
                        }}
                        title="View AI Generated Master Image"
                      >
                        <Eye className="w-3 h-3" />
                        View AI
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[10px] rounded-lg shadow-md bg-blue-600 hover:bg-blue-700 text-white backdrop-blur-sm gap-1"
                        onClick={(e) => handleQueueSingleBullMQ(prod, e)}
                        title="Queue in background (BullMQ)"
                      >
                        <Zap className="w-3 h-3" />
                        Queue
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-[10px] rounded-lg shadow-md bg-background/90 text-orange-500 hover:text-orange-600 backdrop-blur-sm gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/processor?productId=${prod._id}&autostart=true`);
                      }}
                      title="Open in live AI studio"
                    >
                      <Sparkles className="w-3 h-3" />
                      Studio
                    </Button>
                  </div>

                  {/* Delete Icon Button Bottom Left (visible on hover) */}
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute bottom-2 left-2 w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md bg-red-600/90 hover:bg-red-600 text-white backdrop-blur-sm z-10"
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
                <div className="flex flex-col gap-1 mt-0.5">
                  <h4
                    className="font-semibold text-xs truncate text-foreground group-hover:text-primary transition-colors"
                    title={prod.name}
                  >
                    {prod.name}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="truncate max-w-[120px]">{prod.category || "General"}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {prod.dietaryType && prod.dietaryType !== "unknown" && (
                        <span
                          className={`font-medium ${
                            prod.dietaryType === "veg" ? "text-emerald-500" : "text-rose-500"
                          }`}
                        >
                          ● {prod.dietaryType}
                        </span>
                      )}
                    </div>
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
      {/* Delete Page Confirmation Dialog */}
      <Dialog open={isDeletePageDialogOpen} onOpenChange={setIsDeletePageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
              <DialogTitle>Delete Page {page} Products?</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete all{" "}
              <strong className="text-foreground font-semibold">{products.length} products</strong> on{" "}
              <strong>Page {page}</strong>?
              <br />
              <span className="text-rose-400 font-medium">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeletePageDialogOpen(false)}
              disabled={isDeletingPage}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeletePage}
              disabled={isDeletingPage}
              className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeletingPage ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Deleting {products.length} Dishes...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Yes, Delete {products.length} Dishes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Selected Confirmation Dialog */}
      <Dialog open={isDeleteSelectedDialogOpen} onOpenChange={setIsDeleteSelectedDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
              <DialogTitle>Delete {selectedIds.size} Selected Product{selectedIds.size === 1 ? "" : "s"}?</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete the{" "}
              <strong className="text-foreground font-semibold">{selectedIds.size} selected products</strong>?
              <br />
              <span className="text-rose-400 font-medium">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteSelectedDialogOpen(false)}
              disabled={isDeletingSelected}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={isDeletingSelected}
              className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeletingSelected ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Deleting {selectedIds.size} Dishes...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Yes, Delete {selectedIds.size} Selected Dishes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProductTable;
