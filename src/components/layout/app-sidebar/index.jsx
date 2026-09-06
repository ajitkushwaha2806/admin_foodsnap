"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ZomatoScraperPopover } from "@/components/zomato/scraper-popover";
import { LayoutDashboard, Images, UtensilsCrossed, Layers, Sparkles } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar";

const navItems = [
  {
    title: "Overview",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "AI Processor",
    url: "/processor",
    icon: Sparkles,
    badge: "AI",
  },
  {
    title: "Image Manager",
    url: "/images",
    icon: Images,
    badge: "Studio",
  },
  {
    title: "Scraped Products",
    url: "/products",
    icon: UtensilsCrossed,
  },
];

export function AppSidebar({ ...props }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r" {...props}>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold shadow-md shadow-orange-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-sm tracking-tight">FoodSnap</span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Studio Admin
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground uppercase px-2 mb-1">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={`gap-3 py-2 px-3 rounded-lg font-medium transition-colors ${isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                    >
                      <Link href={item.url} className="flex items-center w-full">
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{item.title}</span>
                        {item.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold group-data-[collapsible=icon]:hidden">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4 group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="text-[11px] font-semibold text-muted-foreground uppercase px-2 mb-2">
            Quick Tools
          </SidebarGroupLabel>
          <div className="px-2">
            <ZomatoScraperPopover
              buttonVariant="outline"
              buttonSize="sm"
              className="w-full justify-start text-xs border-dashed"
            />
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export default AppSidebar;
