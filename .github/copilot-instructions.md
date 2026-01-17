# Galactic Contracts - AI Agent Guidelines

## Project Overview
**Galactic Contracts** is a Next.js-based admin dashboard for managing supply chain contracts and inventory planning for Galactic Tycoons (a web-based trading game). The app helps players forecast production capacity, track goods at multiple locations (bases, ships), and manage daily contract fulfillment.

**Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS v4

## Architecture

### Core Data Flow
1. **API Integration** ([`src/app/(admin)/gt-orders/lib/gtApi.ts`](src/app/(admin)/gt-orders/lib/gtApi.ts)): Wraps Galactic Tycoons API (`api.g2.galactictycoons.com`)
   - Implements client-side caching (60s TTL) with localStorage
   - Deduplicates concurrent requests (in-flight promises)
   - Handles rate-limiting with Retry-After headers
   - Fetches: company data (bases/ships), inventory by warehouse, material prices

2. **ContractsEditor Component** ([`src/app/(admin)/gt-orders/ContractsEditor.tsx`](src/app/(admin)/gt-orders/ContractsEditor.tsx)): Main orchestrator
   - Loads contracts/recipes/inventory from localStorage + API
   - Manages UI state (sort order, filters, edit mode)
   - Computes supply chain metrics using planning library functions

3. **Planning Engine** ([`src/app/(admin)/gt-orders/lib/planner.ts`](src/app/(admin)/gt-orders/lib/planner.ts)): Supply chain math
   - `buildStockMap()`: Normalizes multi-location inventory into `Map<material, Map<location, amount>>`
   - `computeContractStatus()`: Allocates available stock to contracts by location, returns fulfillment status
   - `computeProductionNeeded()`: Calculates units required based on recipes and contract demand
   - `computeTransportNeeded()`: Determines what to ship between locations

4. **State Persistence** ([`src/app/(admin)/gt-orders/lib/contracts.ts`](src/app/(admin)/gt-orders/lib/contracts.ts)): localStorage-based
   - Contracts, recipes, and production plans auto-save via `ContractRow` objects
   - Includes migration logic (e.g., backfilling missing `client` field)

### Context Providers
- **ThemeContext** ([`src/context/ThemeContext.tsx`](src/context/ThemeContext.tsx)): Light/dark theme toggle, persisted to localStorage
- **HeaderSlotContext** ([`src/context/HeaderSlotContext.tsx`](src/context/HeaderSlotContext.tsx)): Allows nested pages to inject UI into admin header (e.g., action buttons)
- **SidebarContext**: Controls sidebar collapse state

### Layout Structure
- **Root Layout** ([`src/app/layout.tsx`](src/app/layout.tsx)): Global providers (Theme, Sidebar), font imports
- **Admin Layout** ([`src/app/(admin)/layout.tsx`](src/app/(admin)/layout.tsx)): Wraps all admin routes with header, sidebar, dark-themed shell
- Uses route groups `(admin)` to apply layout to specific page hierarchies

## Developer Workflows

### Local Development
```bash
npm run dev          # Start Next.js dev server (port 3000, hot reload)
npm run build        # Production build (exports static site)
npm run start        # Run production build
npm run lint         # ESLint check
npm run gt:companies # Fetch/cache company directory from API (requires GT_API_KEY)
```

### Environment Setup
- **GT_API_KEY**: Set in `.env.local` for API calls; used by `buildCompanyDirectory.mjs`
- **NODE_ENV**: "production" enables base path (`/free-nextjs-admin-dashboard/`) for GitHub Pages; dev mode uses root

### Build & Deployment
- **Static Export**: `output: "export"` in `next.config.ts` — app generates static HTML/JS, no Node.js runtime needed
- **basePath / assetPrefix**: Auto-configured for GitHub Pages if `GITHUB_ACTIONS` env is set
- **Output**: Writes to `.next` folder; deployable anywhere

## Patterns & Conventions

### API Calls & Caching
- Always check `localStorage` before API calls (avoid redundant requests)
- Use in-flight promises to dedupe concurrent calls: `if (companyInFlight) return companyInFlight`
- Cache TTL typically 60s; keys follow pattern `gt_<domain>_cache_v1`
- Normalize location/material names via `const norm = (x) => x.trim()` helper

### Data Normalization
- **Stock storage**: `Map<materialName, Map<locationName, amount>>` for efficient lookup
- **Contracts**: Grouped by `product||destination` key to aggregate daily demand
- **localStorage keys**: Versioned (`v1`, `v2`) to support migrations
- **ID generation**: `newId()` uses `Math.random().toString(36).slice(2, 10)` for 8-char local IDs

### Component Patterns
- **"use client"**: All interactive components (ContractsEditor, contexts) require `"use client"` directive
- **Hooks**: `useHeaderSlot()`, `useModal()`, `useGoBack()` in `src/hooks/`
- **Client-side effects**: Initialize localStorage reads in `useEffect()` to avoid hydration mismatch
- **BASE_PATH**: Dynamically set for both dev and production; use as prefix in image URLs

### Error Handling
- API errors: Log warnings and fall back to cached data (e.g., "fetchCompany failed (likely rate limit)")
- localStorage failures: Wrapped in try-catch; graceful degradation
- No error boundaries currently — consider adding for prod

## Key Files for New Work

| File | Purpose | When to Edit |
|------|---------|-------------|
| `src/app/(admin)/gt-orders/lib/gtApi.ts` | API layer | Adding new endpoints, caching, deduplication |
| `src/app/(admin)/gt-orders/lib/planner.ts` | Supply chain algorithms | New demand/inventory calculations |
| `src/app/(admin)/gt-orders/lib/contracts.ts` | Contract CRUD | Modifying contract schema or persistence |
| `src/context/HeaderSlotContext.tsx` | Page-to-header communication | Injecting action buttons into header |
| `src/app/(admin)/gt-orders/ContractsEditor.tsx` | Main UI orchestrator | Dashboard layout, table rendering, form logic |
| `src/app/(admin)/layout.tsx` | Admin shell | Theme, sidebar, global styling |
| `Scripts/buildCompanyDirectory.mjs` | Company cache build | Bulk API fetches at deploy time |

## Integration Points

- **Galactic Tycoons API** (`https://api.g2.galactictycoons.com`): Public endpoints for company, warehouse, prices. Requires Bearer token in Authorization header. Rate-limited; 429 responses include Retry-After.
- **localStorage**: Contracts, recipes, API keys, locations persisted here — no backend needed
- **recipe data** ([`public/data/recipes.json`](public/data/recipes.json)): Bundled game recipes; loaded by planner for production calculation
- **company directory** ([`public/images/company-directory.json`](public/images/company-directory.json)): Auto-generated by build script; used for quick lookup without API calls

## Notes for AI Agents

- Always check what's in localStorage before suggesting API calls — the app is offline-first where possible
- When modifying supply chain math (planner.ts), include test cases covering edge cases (zero stock, multiple contracts per product)
- Hydration misses: Never read localStorage during SSR — wrap in `if (typeof window !== "undefined")`
- If adding UI, use Tailwind classes from the existing palette (dark bg, light text) — don't import new CSS libraries
- The codebase uses relative imports with `@/` alias (see tsconfig.json) — maintain this consistency
