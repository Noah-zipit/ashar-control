# Ashar Control

A personal control dashboard that renders projects, goals and notes as an
interactive constellation graph on a canvas — "Nebula Glass" nodes you can
drag, open and edit, instead of a table of cards.

**Live:** https://ashar-control.vercel.app

## What's inside

- `src/components/Constellation.tsx` — the canvas-2D constellation view
  (custom graph layout in `src/lib/graph-layout.ts`)
- `src/lib/` — types, store, seed data and dashboard data, plus the API
  client (`src/lib/api.ts`)
- `src/app/notes` — notes view
- `src/app/admin` — password-gated admin for editing dashboard state
- `src/app/api` — `auth` and `state` routes backing the dashboard
- Installable PWA (service worker registered from `src/app/sw-register.tsx`)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run build
```

Built with Next.js 16, React and TypeScript.
