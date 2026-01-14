"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type HeaderSlotState = {
  rightContent: React.ReactNode;
  setRightContent: (node: React.ReactNode) => void;
};

const HeaderSlotContext = createContext<HeaderSlotState | null>(null);

export function HeaderSlotProvider({ children }: { children: React.ReactNode }) {
  const [rightContent, setRightContent] = useState<React.ReactNode>(null);

  const value = useMemo(
    () => ({ rightContent, setRightContent }),
    [rightContent]
  );

  return (
    <HeaderSlotContext.Provider value={value}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

export function useHeaderSlot() {
  const ctx = useContext(HeaderSlotContext);
  if (!ctx) throw new Error("useHeaderSlot must be used within HeaderSlotProvider");
  return ctx;
}
