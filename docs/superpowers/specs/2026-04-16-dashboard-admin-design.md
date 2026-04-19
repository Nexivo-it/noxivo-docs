# Dashboard Admin UI Design

## Overview
Implement the Mission Control / Embedded Mini-Dashboard for the platform owner to monitor the standalone workflow engine node. This dashboard will provide visibility into node health, hierarchical MessagingProvider session management, BullMQ worker status, and real-time system events.

## UI Specification

### 1. Authentication & Layout
- **Login Page**: A dedicated `/login` route that calls `POST /api/v1/admin/login`.
- **Global API Client**: Axios instance configured with `withCredentials: true` and a base URL pointing to the engine API.
- **Protected Layout**: A wrapper component that redirects to `/login` if no session is detected.
- **Sidebar**: Navigation links to Overview, Sessions, Workers, and Events.
- **Topbar**: Displays the current page title and a logout button.

### 2. Overview Page (`/`)
- **Service Health Cards**: Display the status (Healthy/Unhealthy) of MongoDB, Redis, and the Workflow Engine itself based on `GET /health`.
- **Quick Stats**: Summary counts of active sessions and worker status.

### 3. Sessions Page (`/sessions`)
- **Hierarchical View**: Group sessions by `Agency -> Client (Tenant)`.
- **Session Control**: 
  - Status indicator (WORKING, OFFLINE, STARTING, etc.).
  - Action buttons: Start, Stop, Logout (linked to `POST /api/v1/admin/sessions/:id/{action}`).
  - QR Code Integration: A "Pair WhatsApp" button that opens a modal and displays the QR image from `GET /api/v1/admin/sessions/:id/qr`.
- **Search/Filter**: Filter by Agency name or Session name.

### 4. Workers Page (`/workers`)
- **Queue Stats Cards**: Display `Waiting`, `Active`, `Completed`, `Failed`, and `Delayed` job counts from `GET /api/v1/admin/workers/status`.
- **Visual Progress**: Real-time updates via polling (every 5-10s).

### 5. Events Page (`/events`)
- **Real-time Stream**: Connect to `GET /api/v1/admin/events/stream` via EventSource (SSE).
- **Log Viewer**: A scrolling terminal-like window displaying timestamped events.
- **Persistence**: Temporary in-memory log buffer for the current session.

## Architecture

### Component Hierarchy
```
App
└── BrowserRouter
    ├── Route /login (Login Page)
    └── Route / (Protected Layout)
        ├── Overview (Overview Page)
        ├── Sessions (Sessions Page + QR Modal)
        ├── Workers (Workers Page)
        └── Events (Events Page)
```

### Data Flow
- **REST APIs**: Used for login, session control, health checks, and worker stats.
- **SSE (Server-Sent Events)**: Used for the live event stream.
- **State Management**: React `useState` and `useEffect` for page-level data fetching.

## Design Tokens (Lumina Admin Theme)
Use the CSS variables defined in `apps/dashboard-admin/src/index.css`:
- Background: `var(--surface-base)`
- Cards: `var(--surface-card)`
- Text: `var(--on-surface)`
- Primary: `var(--color-primary)` (#25D366 - WhatsApp Green)

## Success Criteria
- [ ] Users can log in using owner credentials.
- [ ] Overview shows real-time health of services.
- [ ] Admin can start/stop sessions and view QR codes for pairing.
- [ ] Worker stats update automatically.
- [ ] Real-time event stream displays system heartbeats and messages.
