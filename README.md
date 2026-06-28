# TMAP Web Navigation Demo

React, Vite, and Tailwind frontend for a TMAP-powered web navigation demo. The app is built as a practical personal-driver navigation surface, not a map playground: current location, route search, guidance, simulated driving, road status, and traffic-aware route rendering are all available from the root screen.

## What This App Does

- Loads TMAP vector map SDK v3 through the backend proxy.
- Keeps the TMAP app key out of frontend code.
- Searches origin and destination with TMAP POI search.
- Falls back to Sejong University as the current location when browser location is denied or unavailable.
- Opens destination search directly from the root `어디로 갈까요?` control.
- Requests multiple TMAP car route candidates with `trafficInfo=Y` by `searchOption`: recommended, fastest, shortest, and highway-priority.
- Renders route-option overview in forced 2D so origin, destination, and all candidate routes can be compared before guidance starts.
- Renders route lines with congestion-aware segment colors when TMAP returns traffic data.
- Restores the user's previous 2D/3D map mode and pitch after a route option is selected.
- Runs a route-snapped driving simulation with `requestAnimationFrame`.
- Rotates and pans the vector map under the arrow marker so the driving direction stays upward.
- Clips the remaining route-line head in the same animation frame as marker movement, while keeping text and instruction updates throttled.
- Updates next guidance, remaining distance/time, ETA, current address, and road status.
- Provides a floating settings panel for map mode, zoom, 3D pitch, and signed-in user display; settings are locked during route selection.
- Uses local Pretendard as the default UI font.

## Project Layout

```text
/Users/anjeonghyeon/web/navi
├── backend/   # Node/Express TMAP proxy, runs on 8182 by default
├── docs/      # TMAP API notes and downloaded-guide summaries
└── frontend/  # React navigation UI, runs on 8181
```

## Requirements

- Node.js 18 or newer.
- A valid TMAP Open API app key.

Create `/Users/anjeonghyeon/web/navi/backend/.env`:

```env
TMAP_APP_KEY=issued-app-key
PORT=8182
FRONTEND_ORIGIN=http://localhost:8181
```

The frontend must never import or expose `TMAP_APP_KEY`.

## Development

Install dependencies:

```bash
cd /Users/anjeonghyeon/web/navi/frontend
npm install
cd /Users/anjeonghyeon/web/navi/backend
npm install
```

Run the backend:

```bash
cd /Users/anjeonghyeon/web/navi/backend
npm run dev
```

Run the frontend:

```bash
cd /Users/anjeonghyeon/web/navi/frontend
npm run dev
```

Open:

```text
http://localhost:8181
```

Vite proxies `/api` to `http://localhost:8182`.

## Frontend Stack

- React 19
- TypeScript
- Vite 7
- Tailwind CSS 4
- Zustand for navigation state
- React Query for API/search state
- Axios for proxy calls
- Framer Motion for UI transitions
- Phosphor Icons for UI symbols
- Turf for geometry helpers where useful
- Pretendard local variable font

## Backend Proxy Endpoints

The frontend calls local endpoints only:

```text
GET  /api/tmap/sdk.js
GET  /api/tmap/vendor/*
GET  /api/tmap/pois?keyword=...
POST /api/tmap/routes
POST /api/tmap/road-match
GET  /api/tmap/reverse-geocode?lat=...&lng=...
```

The backend sends `appKey` in request headers and normalizes SDK asset loading so the browser does not call TMAP with the key directly. `/api/tmap/routes` validates finite origin/destination coordinates before proxying the request.

## Verification

Run from `/Users/anjeonghyeon/web/navi/frontend`:

```bash
npm test
npm run build
```

The Vite build may warn that `/api/tmap/sdk.js` is a non-module script in `index.html`; this is expected because the SDK is loaded as an external browser script.

## Documentation

- `/Users/anjeonghyeon/web/navi/PRODUCT.md`: product-level principles.
- `/Users/anjeonghyeon/web/navi/frontend/PRODUCT.md`: frontend product behavior and design constraints.
- `/Users/anjeonghyeon/web/navi/docs/tmap-open-api-reference.md`: TMAP concept and SDK reference notes.
- `/Users/anjeonghyeon/web/navi/docs/tmap-api-guide-index.md`: endpoint-level request/response guide extracted from downloaded TMAP docs.
