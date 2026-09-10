"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ZomatoScraperPopover } from "@/components/zomato/scraper-popover";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

import { GpuController } from "@/components/studio/gpu-controller";

export function SiteHeader({ title, children }) {
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname === "/processor") return "AI Image Processor";
    if (pathname === "/images") return "Image Manager";
    if (pathname === "/products") return "Scraped Products";
    return "Dashboard Overview";
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-background/95 backdrop-blur px-6 transition-[width,height] ease-linear">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="text-xs">
                Admin
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs font-semibold">
                {title || getPageTitle()}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-3">
        {children}
        <GpuController />
        <ZomatoScraperPopover buttonSize="sm" />
      </div>
    </header>
  );
}

export default SiteHeader;
