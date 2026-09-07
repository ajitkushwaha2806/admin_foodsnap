"use client";
import { toast } from "sonner";
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageSheet } from "@/components/images/image-sheet";
import { Check, X, Edit2, Trash2, Sparkles } from "lucide-react";
import { updateImage, deleteImage } from "@/services/frontend/images";

export function ImageCard({ image, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const isApproved = image?.approved;
  const isLatest = image?.latest;

  const handleToggleApproval = async (e) => {
    e.stopPropagation();
    try {
      setLoading(true);
      await updateImage(image._id, { approved: !isApproved });
      toast.success(
        !isApproved ? "Image marked as approved" : "Image moved to pending review"
      );
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error("Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLatest = async (e) => {
    e.stopPropagation();
    try {
      setLoading(true);
      await updateImage(image._id, { latest: !isLatest });
      toast.success(
        !isLatest ? "Image marked as Latest" : "Image removed from Latest"
      );
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error("Failed to update latest status");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    try {
      setLoading(true);
      await deleteImage(image._id);
      toast.success("Image deleted successfully");
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error("Failed to delete image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageSheet image={image} onUpdated={onRefresh}>
      <Card className="group overflow-hidden rounded-xl border bg-card hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
          <img
            src={image?.image_url || image?.processedImageUrl || image?.originalUrl || "/file.svg"}
            alt={image?.title || image?.name || "Food"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
          />

          {/* Top Status Badges */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={isApproved ? "default" : "secondary"}
              className={`text-[10px] px-1.5 py-0.5 font-semibold backdrop-blur-md shadow-sm ${isApproved
                ? "bg-emerald-600/90 hover:bg-emerald-600 text-white"
                : "bg-neutral-900/80 hover:bg-neutral-900 text-neutral-200"
                }`}
            >
              {isApproved ? "Approved" : "Pending"}
            </Badge>

            {isLatest && (
              <Badge
                variant="default"
                className="text-[10px] px-1.5 py-0.5 font-semibold backdrop-blur-md shadow-sm bg-blue-600/90 hover:bg-blue-600 text-white flex items-center gap-0.5"
              >
                <Sparkles className="w-2.5 h-2.5" />
                Latest
              </Badge>
            )}

            {image?.food_type && image.food_type !== "unknown" && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0.5 font-medium backdrop-blur-md bg-background/80 ${image.food_type === "veg"
                  ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : "border-red-500 text-red-600 dark:text-red-400"
                  }`}
              >
                {image.food_type === "veg" ? "🌱 Veg" : "🍗 Non-Veg"}
              </Badge>
            )}
          </div>

          <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-background/90 backdrop-blur-md p-1 rounded-lg border shadow-md">
            <Button
              size="icon"
              variant={isApproved ? "destructive" : "default"}
              className="w-7 h-7"
              onClick={handleToggleApproval}
              disabled={loading}
              title={isApproved ? "Revoke Approval" : "Approve Image"}
            >
              {isApproved ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            </Button>
            <Button
              size="icon"
              variant={isLatest ? "default" : "outline"}
              className={`w-7 h-7 ${isLatest ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" : ""}`}
              onClick={handleToggleLatest}
              disabled={loading}
              title={isLatest ? "Remove from Latest" : "Mark as Latest"}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="w-7 h-7"
              title="Edit details"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={loading}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* <div className="px-2.5 flex flex-col justify-center">
          <h4 className="font-semibold text-xs line-clamp-1 leading-snug group-hover:text-primary transition-colors">
            {image?.title || image?.name || "Untitled Image"}
          </h4>
          {image?.category && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              {image.category} {image.sub_category && image.sub_category !== image.category ? `• ${image.sub_category}` : ""}
            </p>
          )}
        </div> */}
      </Card>
    </ImageSheet>
  );
}

export default ImageCard;
