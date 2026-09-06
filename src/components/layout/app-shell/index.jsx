"use client";

import React from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { Toaster } from "@/components/ui/sonner";

export function AppShell({ children, title, headerActions }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-screen flex flex-col bg-muted/20">
        <SiteHeader title={title}>{headerActions}</SiteHeader>
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
        <Toaster position="top-right" richColors />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
