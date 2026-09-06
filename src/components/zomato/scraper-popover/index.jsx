"use client";
import { toast } from "sonner";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { scrapeAndImportZomatoMenu } from "@/services/frontend/zomato-scraper";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Sparkles, ExternalLink, CheckCircle2, Soup } from "lucide-react";

export function ZomatoScraperPopover({ onSuccess, buttonVariant = "default", buttonSize = "default", className = "" }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const isValidUrl = (val) => {
    return val.toLowerCase().includes("zomato.com");
  };

  const handleScrape = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a Zomato URL");
      return;
    }

    if (!isValidUrl(url)) {
      toast.error("Please enter a valid Zomato restaurant link (e.g. zomato.com/city/restaurant)");
      return;
    }

    try {
      setLoading(true);
      setLastResult(null);

      const res = await scrapeAndImportZomatoMenu(url);

      if (res.success) {
        setLastResult(res);
        toast.success(
          `Imported ${res.importedCount} new products from ${res.restaurantName || "Zomato"}! (${res.count} total)`
        );
        setUrl("");
        if (onSuccess) {
          onSuccess(res);
        }
      } else {
        toast.error(res.error || "Failed to import products from Zomato");
      }
    } catch (err) {
      const errorMsg =
        err?.response?.data?.error ||
        err?.message ||
        "Failed to scrape Zomato menu";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className={`gap-2 shadow-sm font-medium transition-all ${className}`}
        >
          <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
          <span>Import from Zomato</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-4 bg-background border rounded-xl shadow-xl space-y-4"
      >
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center font-bold">
              <Soup className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-sm leading-tight">
                Zomato Menu Scraper
              </h4>
              <p className="text-xs text-muted-foreground">
                Extract dish names, descriptions & categories
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleScrape} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="zomato-url" className="text-xs font-medium">
              Restaurant Order URL
            </Label>
            <Input
              id="zomato-url"
              placeholder="https://www.zomato.com/bangalore/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="text-xs h-9 font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Auto de-duplicates
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !url.trim()}
              className="gap-1.5 font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Scrape & Save
                </>
              )}
            </Button>
          </div>
        </form>

        {lastResult && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{lastResult.restaurantName || "Import Completed"}</span>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Saved <strong className="text-foreground">{lastResult.importedCount}</strong> new items (out of {lastResult.count} items parsed).
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default ZomatoScraperPopover;
