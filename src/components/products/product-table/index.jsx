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
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dietaryFilter, setDietaryFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["products", { search, categoryFilter, dietaryFilter, page }],
    queryFn: () =>
      getProducts({
        search: search || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        dietaryType: dietaryFilter !== "all" ? dietaryFilter : undefined,
        page,
        limit: 24,
      }),
  });

  const products = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;
  const totalCount = data?.pagination?.total || 0;
  const categories = data?.categories || [];

  const handleDelete = async (id) => {
    try {
      await deleteProduct(id);
      toast.success("Product deleted");
      refetch();
    } catch (err) {
      toast.error("Failed to delete product");
    }
  };

  return (
    <div className="space-y-4">

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card rounded-xl border shadow-sm">
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

        <div className="flex items-center gap-2.5 flex-wrap">
          <Select
            value={dietaryFilter}
            onValueChange={(val) => {
              setDietaryFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36 h-9 text-xs">
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
              <SelectTrigger className="w-44 h-9 text-xs">
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

          <Button
            size="sm"
            onClick={() => router.push("/processor?autostart=true")}
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-medium text-xs h-9 gap-1.5 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Process with AI
          </Button>

          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats and Count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing <strong className="text-foreground">{products.length}</strong> of{" "}
          <strong className="text-foreground">{totalCount}</strong> products
        </span>
        <span>Page {page} of {totalPages}</span>
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
          {products.map((prod) => (
            <Card
              key={prod._id}
              className="group p-3 rounded-xl border bg-card hover:shadow-md transition-all duration-200 space-y-2 flex flex-col cursor-pointer"
              onClick={() => router.push(`/processor?productId=${prod._id}&autostart=true`)}
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

                {/* AI Process Button Bottom Right */}
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-2 right-2 h-7 px-2 text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md bg-background/90 text-orange-500 hover:text-orange-600 backdrop-blur-sm gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/processor?productId=${prod._id}&autostart=true`);
                  }}
                  title="Process with AI"
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

              {/* Only Name (Truncated) */}
              <div>
                <h4
                  className="font-semibold text-xs truncate text-foreground group-hover:text-primary transition-colors"
                  title={prod.name}
                >
                  {prod.name}
                </h4>
              </div>
            </Card>
          ))}
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
    </div>
  );
}

export default ProductTable;
