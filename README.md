# Roady Navigation Frontend

React, Vite, and Tailwind frontend for the Roady driver-assistance navigation project. The app is built as a practical in-car navigation surface for route search, guidance, simulated driving, road status, and traffic-aware route rendering. It is designed to work with the broader backend that will detect abnormal driver behavior and issue driver guidance/instructions.

## Naming

The navigation product and assistant are named `로디`. Use `Roady` in English-facing product copy. Existing lowercase `roadie` package, storage, and technical identifiers are retained unless a separate migration explicitly changes them.

## What This App Does

- Loads TMAP vector map SDK v3 through the backend proxy.
- Keeps the TMAP app key out of frontend code.
- Loads `/api/v1/bootstrap` on app start for account metadata, profiles, selected profile, profile limit, and backend capabilities.
- Searches origin and destination with TMAP POI search.
- Shows recent search histories when the route search input is empty, and writes selected/searched places through profile-scoped search-history APIs.
- Falls back to Sejong University as the current location when browser location is denied or unavailable.
- Opens destination search directly from the root `어디로 갈까요?` control.
- Provides profile selection, profile create/edit/delete, and selected-profile display for the in-car navigation session.
- Edits profile behavior warning sensitivity per backend behavior class instead of using one global warning sensitivity.
- Manages profile-specific saved-place labels from the right rail label settings panel.
- Requests multiple TMAP car route candidates with `trafficInfo=Y` by `searchOption`: recommended, fastest, shortest, and highway-priority.
- Renders route-option overview in forced 2D so origin, destination, and all candidate routes can be compared before guidance starts.
- Renders route lines with congestion-aware segment colors when TMAP returns traffic data.
- Restores the user's previous 2D/3D map mode and pitch after a route option is selected.
- Runs a route-snapped driving simulation with `requestAnimationFrame`.
- Rotates and pans the vector map under the arrow marker so the driving direction stays upward.
- Clips the remaining route-line head in the same animation frame as marker movement, while keeping text and instruction updates throttled.
- Updates next guidance, remaining distance/time, ETA, current address, and road status.
- Provides a floating settings panel for map mode, zoom, 3D pitch, and selected driver profile display; settings are locked during route selection.
- Provides a mock driving report dashboard using Recharts while the report UI is being designed before full backend report wiring.
- Uses local Pretendard as the default UI font.

## Project Layout

```text
/Users/anjeonghyeon/web/jiin
├── navigation/          # React navigation UI, runs on 8181
├── backend/             # FastAPI backend and TMAP proxy, runs on 8000
└── navigation-backend/  # Legacy Node/Express TMAP proxy retained as migration reference
```

## Requirements

- Node.js 18 or newer.
- Docker Desktop and Docker Compose for the backend.
- A valid TMAP Open API app key.

Create `/Users/anjeonghyeon/web/jiin/backend/.env` from the backend example:

```bash
cd /Users/anjeonghyeon/web/jiin/backend
cp .env.example .env
```

Set `TMAP_APP_KEY` in `backend/.env`.

The frontend must never import or expose `TMAP_APP_KEY`.

## Development

Install dependencies:

```bash
cd /Users/anjeonghyeon/web/jiin/navigation
npm install
```

Run the backend:

```bash
cd /Users/anjeonghyeon/web/jiin/backend
docker compose up --build -d
```

Run the frontend:

```bash
cd /Users/anjeonghyeon/web/jiin/navigation
npm run dev
```

Open:

```text
http://localhost:8181
```

Vite proxies `/api` to `http://localhost:8000`.

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

## Backend API Endpoints

The frontend calls local endpoints only. During development, Vite forwards these requests to the FastAPI backend:

```text
GET  /api/v1/bootstrap
GET  /api/v1/profiles
POST /api/v1/profiles
PATCH /api/v1/profiles/{profileId}
DELETE /api/v1/profiles/{profileId}
POST /api/v1/profiles/{profileId}/select
GET  /api/v1/profiles/{profileId}/saved-places
PUT  /api/v1/profiles/{profileId}/saved-places/{placeType}
POST /api/v1/profiles/{profileId}/favorites
PATCH /api/v1/saved-places/{placeId}
DELETE /api/v1/saved-places/{placeId}
GET  /api/v1/profiles/{profileId}/search-histories
POST /api/v1/profiles/{profileId}/search-histories
DELETE /api/v1/profiles/{profileId}/search-histories
GET  /api/tmap/sdk.js
GET  /api/tmap/vendor/{asset_path:path}
GET  /api/tmap/pois?keyword=...
POST /api/tmap/routes
POST /api/tmap/road-match
GET  /api/tmap/reverse-geocode?lat=...&lng=...
```

The backend sends `appKey` in request headers and normalizes SDK asset loading so the browser does not call TMAP with the key directly. `/api/tmap/routes` validates finite origin/destination coordinates before proxying the request.

`bootstrap.account` is available for future account-level UI, but the current settings drawer intentionally displays the selected driver profile name. Profile create/update uses numeric `behaviorWarningSensitivity` values from 3 to 10 with the backend behavior keys `DROWSINESS`, `PHONE_USE`, `FOOD_OR_DRINK`, `GAZE_AWAY`, `SECONDARY_TASK`, `REACHING_BEHIND`, and `SMOKING`; values 4 and below show a safety warning in the profile editor.

`navigation-backend` no longer needs to run for this frontend in the migrated development flow.

## Verification

Run from `/Users/anjeonghyeon/web/jiin/navigation`:

```bash
npm test -- src/features/navigation/api/tmapApi.test.ts src/features/navigation/api/bootstrapApi.test.ts src/features/navigation/api/profileApi.test.ts src/features/navigation/components/NavigationShell.test.tsx
npm run build
```

The Vite build may warn that `/api/tmap/sdk.js` is a non-module script in `index.html`; this is expected because the SDK is loaded as an external browser script.

## Documentation

- `/Users/anjeonghyeon/web/jiin/README.md`: workspace-level architecture.
- `/Users/anjeonghyeon/web/jiin/docs/README.md`: documentation index.
- `/Users/anjeonghyeon/web/jiin/docs/api/navigation-backend-api-usage.md`: traced navigation API usage and migration scope.
- `/Users/anjeonghyeon/web/jiin/navigation/docs/frontend-shadcn-mcp-guidelines.md`: shadcn MCP workflow and UI component rules for this frontend.
- `/Users/anjeonghyeon/web/jiin/backend/README.md`: backend APIs and Docker setup.
