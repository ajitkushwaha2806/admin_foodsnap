"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/services/frontend/dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Images,
  UtensilsCrossed,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: getDashboardStats,
  });

  const stats = data?.data || {
    totalImages: 0,
    approvedImages: 0,
    pendingImages: 0,
    totalProducts: 0,
    recentImages: [],
    recentProducts: [],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Studio Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time overview of food imagery & scraped menus.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Total Images
            </CardTitle>
            <Images className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats.totalImages}</div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Processed studio photos</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Approved
            </CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-emerald-500">
                {stats.approvedImages}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Live in production</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Pending Review
            </CardTitle>
            <Clock className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-orange-500">
                {stats.pendingImages}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Scraped Products
            </CardTitle>
            <UtensilsCrossed className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-red-500">
                {stats.totalProducts}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Zomato menu items</p>
          </CardContent>
        </Card>
      </div>

      {/* Recents Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Images Preview */}
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold">Recent Images</CardTitle>
              <CardDescription className="text-xs">Latest uploaded/approved photos</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link href="/images">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                ))}
              </div>
            ) : stats.recentImages.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {stats.recentImages.map((img) => (
                  <div
                    key={img._id}
                    className="relative aspect-square rounded-lg overflow-hidden border bg-muted/30 group"
                  >
                    <img
                      src={img.image_url || img.processedImageUrl || img.originalUrl || "/file.svg"}
                      alt={img.title || img.name || "Food"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                      <span className="text-[10px] text-white font-medium line-clamp-1">
                        {img.title || img.name || "Food Item"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                No images stored yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Products */}
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold">Recent Scraped Dishes</CardTitle>
              <CardDescription className="text-xs">Extracted from Zomato menus</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
              <Link href="/products">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : stats.recentProducts.length > 0 ? (
              <div className="space-y-2.5">
                {stats.recentProducts.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="space-y-0.5 max-w-[70%]">
                      <h5 className="font-semibold text-xs line-clamp-1">{p.name}</h5>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {p.category} {p.sub_category ? `• ${p.sub_category}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        p.dietaryType === "veg"
                          ? "text-emerald-500 border-emerald-500/30"
                          : p.dietaryType === "non-veg"
                          ? "text-red-500 border-red-500/30"
                          : "text-muted-foreground"
                      }`}
                    >
                      {p.dietaryType === "veg"
                        ? "Veg"
                        : p.dietaryType === "non-veg"
                        ? "Non-Veg"
                        : "Unknown"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                No products scraped yet. Click &quot;Import from Zomato&quot; to begin!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
