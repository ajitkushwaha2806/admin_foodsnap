import React from "react";
import { ImageManager } from "@/components/images/image-manager";

export const metadata = {
  title: "Image Manager - FoodSnap Studio",
  description: "Browse, filter, approve, and edit food image library",
};

export default function ImagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Image Studio Manager</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Review, approve, and tag generated food imagery.
        </p>
      </div>

      <ImageManager />
    </div>
  );
}
