"use client";

import AppHeader from "@/layout/AppHeader";
import React from "react";
import { HeaderSlotProvider, useHeaderSlot } from "@/context/HeaderSlotContext";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { rightContent } = useHeaderSlot();

  return (
    <div className="min-h-screen">
      <AppHeader
        leftContent={<div className="text-sm font-semibold">Galactic Contracts</div>}
        rightContent={rightContent}
      />
      <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <HeaderSlotProvider>
      <AdminShell>{children}</AdminShell>
    </HeaderSlotProvider>
  );
}
