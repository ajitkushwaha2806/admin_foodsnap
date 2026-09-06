"use client";

import React, { useState } from "react";
import { Download, Eye, Sparkles, Archive, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export function ResultsGrid({ items, onOpenCompare }) {
  const [isZipping, setIsZipping] = useState(false);

  const completedItems = items.filter((item) => item.status === "completed" && item.outputImageUrl);

  const handleDownloadSingle = async (item) => {
    try {
      const response = await fetch(item.outputImageUrl);
      const blob = await response.blob();
      saveAs(blob, `ai-${item.name.replace(/[/\\?%*:|"<>]/g, "_")}.png`);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handleDownloadAllZip = async () => {
    if (completedItems.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("foodsnap-ai-processed-images");

      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        const res = await fetch(item.outputImageUrl);
        const blob = await res.blob();
        folder.file(`transformed_${i + 1}_${item.name.replace(/[/\\?%*:|"<>]/g, "_")}.png`, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `foodsnap_ai_batch_${Date.now()}.zip`);
    } catch (err) {
      console.error("ZIP Generation failed:", err);
    } finally {
      setIsZipping(false);
    }
  };

  if (completedItems.length === 0) {
    return null;
  }

  return (
    <Card className="p-5 shadow-sm border bg-card">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              Converted AI Output Gallery
            </CardTitle>
            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
              {completedItems.length} {completedItems.length === 1 ? "Output" : "Outputs"}
            </Badge>
          </div>
          <CardDescription className="text-xs mt-0.5">
            Transformed dish images saved to database and ready for review.
          </CardDescription>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadAllZip}
          disabled={isZipping}
          className="border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 text-xs h-8"
        >
          <Archive className="mr-1.5 h-3.5 w-3.5" />
          {isZipping ? "Creating ZIP..." : "Download All (.ZIP)"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {completedItems.map((item, index) => (
          <div
            key={item.id}
            className="group relative flex flex-col rounded-xl border bg-card p-2 overflow-hidden hover:border-emerald-500/40 hover:shadow-sm transition-all"
          >
            {/* Output Image Preview */}
            <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
              <img
                src={item.outputImageUrl}
                alt={item.name}
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />

              {/* Hover Actions Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity p-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpenCompare(item)}
                  className="h-7 text-xs bg-background/90"
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Compare
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadSingle(item)}
                  className="h-7 w-7 p-0 bg-background/90"
                  title="Download image"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>

              {/* Index Tag */}
              <div className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-emerald-400 backdrop-blur-md border border-emerald-500/20">
                #{index + 1}
              </div>
            </div>

            {/* Title & Metadata */}
            <div className="mt-2 flex items-center justify-between text-xs">
              <div className="truncate pr-1">
                <p className="font-semibold truncate">{item.name}</p>
                {item.executionTimeSec ? (
                  <p className="text-[10px] text-muted-foreground">
                    Rendered in {item.executionTimeSec.toFixed(1)}s
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenCompare(item)}
                className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                title="View comparison"
              >
                <Eye className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
