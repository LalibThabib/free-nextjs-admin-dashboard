"use client";

import AppHeader from "@/layout/AppHeader";
import React from "react";
import { HeaderSlotProvider, useHeaderSlot } from "@/context/HeaderSlotContext";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { rightContent } = useHeaderSlot();

  return (
    <div className="min-h-screen bg-[#222222] text-[#e2e2e2] [background-image:url('/images/patterns/bg-pattern.svg')] [background-repeat:repeat] [background-size:400px_400px]">
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
