"use client";
import { toast } from "sonner";
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { updateImage } from "@/services/frontend/images";
import { Loader2, Sparkles, CheckCircle, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "@/components/ui/sheet";

export function ImageSheet({ image, children, onUpdated }) {
  const [formData, setFormData] = useState(image || {});
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddTag = (e) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const currentTags = formData.tags || [];
      if (!currentTags.includes(tagInput.trim())) {
        handleChange("tags", [...currentTags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    const currentTags = formData.tags || [];
    handleChange(
      "tags",
      currentTags.filter((t) => t !== tagToRemove)
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateImage(image._id, formData);
      toast.success("Image details updated successfully");
      if (onUpdated) onUpdated(formData);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update image");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="overflow-y-auto w-full sm:max-w-md p-6">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="text-base font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Edit Image Details
          </SheetTitle>
        </SheetHeader>

        <div className="relative aspect-video rounded-xl overflow-hidden border bg-muted/50 mt-4 shadow-sm">
          <img
            src={formData.image_url || formData.processedImageUrl || formData.originalUrl || "/file.svg"}
            alt={formData.title || formData.name || "Food preview"}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
            <Badge
              variant={formData.approved ? "default" : "secondary"}
              className={
                formData.approved
                  ? "bg-emerald-600 hover:bg-emerald-600 text-white shadow-sm"
                  : "bg-neutral-800 text-neutral-300"
              }
            >
              {formData.approved ? "Approved" : "Pending Review"}
            </Badge>
            {formData.latest && (
              <Badge className="bg-blue-600 hover:bg-blue-600 text-white shadow-sm flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Latest
              </Badge>
            )}
            {formData.premium && (
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
                Premium
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Title</Label>
            <Input
              value={formData.title || formData.name || ""}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="e.g. Butter Chicken Curry"
              className="text-sm font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description</Label>
            <Textarea
              rows={3}
              value={formData.description || ""}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Brief description of the dish or presentation"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Food Type</Label>
              <Select
                value={formData.food_type || "unknown"}
                onValueChange={(val) => handleChange("food_type", val)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="veg">🌱 Veg</SelectItem>
                  <SelectItem value="non-veg">🍗 Non-Veg</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cuisine</Label>
              <Input
                value={formData.cuisine || ""}
                onChange={(e) => handleChange("cuisine", e.target.value)}
                placeholder="e.g. North Indian"
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Input
                value={formData.category || ""}
                onChange={(e) => handleChange("category", e.target.value)}
                placeholder="e.g. Main Course"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sub Category</Label>
              <Input
                value={formData.sub_category || ""}
                onChange={(e) => handleChange("sub_category", e.target.value)}
                placeholder="e.g. Curries"
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Tags</span>
              <span className="text-[10px] text-muted-foreground">Press Enter to add</span>
            </Label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Type tag and press enter..."
              className="text-xs"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(formData.tags || []).map((tag, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-xs py-0.5 px-2 bg-muted/60 flex items-center gap-1 cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  onClick={() => handleRemoveTag(tag)}
                >
                  <Tag className="w-2.5 h-2.5" />
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="approved-status"
                checked={formData.approved || false}
                onCheckedChange={(val) => handleChange("approved", !!val)}
              />
              <Label
                htmlFor="approved-status"
                className="text-xs font-medium cursor-pointer"
              >
                Mark as Approved for Production
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="latest-status"
                checked={formData.latest || false}
                onCheckedChange={(val) => handleChange("latest", !!val)}
              />
              <Label
                htmlFor="latest-status"
                className="text-xs font-medium cursor-pointer flex items-center gap-1.5"
              >
                <span>Mark as Latest</span>
                <span className="text-[10px] text-muted-foreground font-normal">(Featured in Latest filter & collection)</span>
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="premium-status"
                checked={formData.premium || false}
                onCheckedChange={(val) => handleChange("premium", !!val)}
              />
              <Label
                htmlFor="premium-status"
                className="text-xs font-medium cursor-pointer"
              >
                Mark as Premium Asset
              </Label>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t pt-4 flex gap-2">
          <SheetClose asChild>
            <Button variant="outline" size="sm" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 font-medium">
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Save Changes
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default ImageSheet;
