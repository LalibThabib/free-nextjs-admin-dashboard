"use client";

import AppHeader from "@/layout/AppHeader";
import React from "react";
import { HeaderSlotProvider, useHeaderSlot } from "@/context/HeaderSlotContext";
const BASE_PATH = process.env.NODE_ENV === "production" ? "/free-nextjs-admin-dashboard" : "";


function AdminShell({ children }: { children: React.ReactNode }) {
  const { rightContent } = useHeaderSlot();

  return (
    <div className="min-h-screen bg-[#222222] text-[#e2e2e2] [background-image:url('/free-nextjs-admin-dashboard/images/patterns/bg-pattern.svg')]
 [background-repeat:repeat] [background-size:400px_400px]">
      <AppHeader
        leftContent={
  <div className="mx-auto w-full max-w-(--breakpoint-2xl) px-4 md:px-6">
    <div className="flex items-center gap-3 pl-15">
      <img
  src={`${BASE_PATH}/images/logo/app-logo.svg`}
  alt="Galactic Contracts"
  className="h-7 w-7"
/>

      <div className="text-xl font-semibold">Galactic Contracts</div>

    </div>
  </div>
}

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
