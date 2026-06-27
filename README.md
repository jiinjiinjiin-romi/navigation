# TMAP Web Navigation Demo

React, Vite, and Tailwind frontend for a TMAP-powered web navigation demo. The app is built as a practical personal-driver navigation surface, not a map playground: current location, route search, guidance, simulated driving, road status, and traffic-aware route rendering are all available from the root screen.

## What This App Does

- Loads TMAP vector map SDK v3 through the backend proxy.
- Keeps the TMAP app key out of frontend code.
- Searches origin and destination with TMAP POI search.
- Requests car routes from TMAP route guidance with `trafficInfo=Y`.
- Renders route lines with congestion-aware segment colors when TMAP returns traffic data.
- Runs a route-snapped driving simulation with `requestAnimationFrame`.
- Rotates and pans the vector map under the arrow marker so the driving direction stays upward.
- Updates next guidance, remaining distance/time, ETA, current address, and road status.
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

The backend sends `appKey` in request headers and normalizes SDK asset loading so the browser does not call TMAP with the key directly.

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
