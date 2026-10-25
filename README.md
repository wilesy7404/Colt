# Race Team Maintenance System

A responsive, local-first prototype for tracking maintenance and parts for a 2004 Nissan 350Z road-course race car used in NASA/SCCA events.

## Project status

This repository is a **development prototype**, not a validated maintenance record or production system. The original ChatGPT download links were failing, so this GitHub repository is being used as the delivery location.

- Admin UI should work on desktop and phone.
- Race-day workflow should be simple on mobile.
- Usage metrics: laps and engine hours.
- Component identity/history, maintenance intervals, sealed kits, inventory, event prep, and safe replacement sign-off are core requirements.
- Demo data and draft intervals are illustrative only. Do not use them as maintenance recommendations.

## Files

- `index.html` — application prototype.
- `PROJECT_HANDOFF.md` — full requirements, decisions, and roadmap.
- `manifest.webmanifest`, `icon.svg`, `sw.js` — installable-web-app foundation.

## Run locally

Open `index.html` in a browser for basic use. For PWA/service-worker behavior, serve the folder over localhost or HTTPS; service workers do not run from `file://`.

For example, with Python installed:
```powershell
py -m http.server 8080
```
Then open `http://localhost:8080`.

## Important limitations

The prototype uses browser-local storage. It does not yet provide authentication, a shared database, multi-device synchronization, a production backup system, or a native iPhone package. Browser-local data can be lost if site data is cleared. Do not rely on this prototype as the sole record of real maintenance work.

## Safety

No service intervals, torque specifications, or engineering limits are supplied as approved values. Add only verified rules with documented sources/revisions. A software status is not a certification that the vehicle is safe for racing.
