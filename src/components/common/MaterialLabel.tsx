"use client";

import React from "react";

const BASE_PATH = process.env.NODE_ENV === "production" ? "/free-nextjs-admin-dashboard" : "";
const SPRITE_URL = `${BASE_PATH}/images/assets/sprite-BAyyILFt.svg`;
const ICON_OVERRIDES: Record<string, string> = {
  "Copper": "CopperBar",
  "Iron": "IronBar",
  "Hydrogen Fuel": "HydrogenFuelCell",
  "Superconducting Coil" : "Superconductors",
  // add more as you find them
};


function toSymbolId(materialName: string) {
  // Keep original casing (important for acronyms: "AI Core" -> "AICore")
  // Just remove spaces/punctuation: "Iron Ore" -> "IronOre"
  return String(materialName || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "");
}

export function MaterialLabel({
  name,
  size = 27,
  className = "",
  showText = true,
}: {
  name: string;
  size?: number;
  className?: string;
  showText?: boolean;
}) {
 const symbolId = ICON_OVERRIDES[name] ?? toSymbolId(name);

  if (!symbolId) {
    return <span className={className}>{showText ? name : null}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} className="shrink-0" aria-hidden="true" focusable="false">
        
        <use href={`${SPRITE_URL}#${symbolId}`} xlinkHref={`${SPRITE_URL}#${symbolId}`} />
      </svg>
      {showText ? <span>{name}</span> : null}
    </span>
  );
}

