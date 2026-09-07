"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import React, { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getImages } from "@/services/frontend/images";
import { ImageCard } from "@/components/images/image-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkUploadModal } from "@/components/images/bulk-upload-modal";
import { Search, RefreshCw, Image as ImageIcon, X, Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ImageManager() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [foodTypeFilter, setFoodTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [latestFilter, setLatestFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchInput]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      "images",
      {
        search: debouncedSearch,
        statusFilter,
        foodTypeFilter,
        categoryFilter,
        latestFilter,
        page,
      },
    ],
    queryFn: () =>
      getImages({
        search: debouncedSearch || undefined,
        approved:
          statusFilter === "approved"
            ? "true"
            : statusFilter === "pending"
              ? "false"
              : undefined,
        food_type: foodTypeFilter !== "all" ? foodTypeFilter : undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        latest:
          latestFilter === "latest"
            ? "true"
            : latestFilter === "not_latest"
              ? "false"
              : undefined,
        page,
        limit: 24,
      }),
  });

  const images = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;
  const totalCount = data?.pagination?.total || 0;
  const categories = data?.categories || [];

  const handleResetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setFoodTypeFilter("all");
    setCategoryFilter("all");
    setLatestFilter("all");
    setPage(1);
  };

  const hasActiveFilters =
    debouncedSearch ||
    statusFilter !== "all" ||
    foodTypeFilter !== "all" ||
    categoryFilter !== "all" ||
    latestFilter !== "all";

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-3 rounded-xl border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search dish title, tags, description..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-8 h-9 text-xs"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Tabs
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs px-3">
                All
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-xs px-3">
                Approved
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs px-3">
                Pending
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={foodTypeFilter}
            onValueChange={(val) => {
              setFoodTypeFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="Food Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="veg">🌱 Veg</SelectItem>
              <SelectItem value="non-veg">🍗 Non-Veg</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={latestFilter}
            onValueChange={(val) => {
              setLatestFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="Latest" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="latest">✨ Latest Only</SelectItem>
              <SelectItem value="not_latest">Standard Only</SelectItem>
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
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </Button>
          )}

          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh list"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>

          <Button
            size="sm"
            onClick={() => setIsBulkUploadOpen(true)}
            className="gap-1.5 h-9 text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bulk AI Upload</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing <strong className="text-foreground">{images.length}</strong> of{" "}
          <strong className="text-foreground">{totalCount}</strong> images
        </span>
        <span>
          Page {page} of {totalPages}
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="p-2 border rounded-xl bg-card space-y-2">
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : images.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <ImageCard key={img._id} image={img} onRefresh={() => refetch()} />
          ))}
        </div>
      ) : (
        <div className="p-10 text-center border rounded-xl bg-card flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-sm">No images found</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Try adjusting your search criteria or clear your active filters.
            </p>
          </div>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs"
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            {page} / {totalPages}
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

      <BulkUploadModal
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

export default ImageManager;
