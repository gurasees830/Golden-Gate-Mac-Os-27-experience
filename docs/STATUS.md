# Golden Gate — status report

Golden Gate is a browser-based macOS-inspired desktop simulator. This page records what is implemented, what is simulated, and what could not be done or verified.

## Verified in this build

| Area | How it was checked |
|---|---|
| Frontend type safety | `tsc -b` with `strict: true` — 0 errors |
| Unit tests | `npm test` — 30 passing (calculator, shell interpreter, Calendar date parser, virtual file system with fake IndexedDB, window/app lifecycle, UI controls with Testing Library) |
| End-to-end | `npm run test:e2e` — 8 passing in Chromium against the production build: boot without errors, wallpaper + dark mode survive a reload, Finder creates a folder, Terminal writes and reads a file, Spotlight maths + launch, App Store install puts the app in the Dock, Alt-Tab app switcher, YouTube link opens the embedded player |
| Visual review | Desktop, Finder, Settings, About This Mac, Spotlight, Launchpad, Control Center, Notification Center, Notes, Calendar, Terminal, App Store, Safari, Maps, Music, Photos, Mail, Messages, Weather, dark mode, tiling preview, genie minimise, zoom glide, app switcher |

Bugs the tests caught and that were fixed: "day after tomorrow" parsed as tomorrow; `-3^2` evaluated to 9; `mod` keyword unsupported; typing a space while renaming in Finder opened Quick Look.

## Not verified here

- **Backend**: the Spring Boot service and its JUnit tests are written but were not compiled or run, because the build environment could not reach Maven Central. Run `mvn test` in `backend/` before relying on it.
- **Docker images** were not built for the same reason (the compose file is validated with `docker compose config`).
- **Live web content**: the test browser had no internet access, so YouTube playback, Google search embedding and real web pages in Safari were checked for layout and URLs only. Weather fell back to its labelled demo mode.

## Simulated (by design)

- Wi‑Fi shows your browser's real connection (online state, link type, bandwidth, latency). Browsers can't read the network name or list nearby networks, so you can type the name yourself in Settings ▸ Wi‑Fi. Bluetooth devices, AirDrop, firewall, Time Machine schedules, software updates and App Store downloads are simulations; installs write real records and launchable apps, but nothing is downloaded from the internet.
- Battery uses the Battery Status API where available (Chromium); elsewhere it shows "not reported".
- The Terminal is a zsh-flavoured interpreter over the virtual disk. It cannot run programs, reach the network or touch your computer, and says so.
- Messages talks to a local assistant bot; Mail delivers only between local mailboxes.

## Known limitations

- **Browser-reserved keys**: outside full screen, browsers and the host OS keep ⌘/Alt-Tab, Ctrl-Tab, Ctrl-W/N/T. Alternatives: Alt-` (App Switcher), Alt-W/N/Q, Alt-1…9 and Alt-]/[ for Safari tabs. Turning on Full Screen (Control Center) engages Keyboard Lock on Chromium browsers so they pass through. Trackpad swipe-back and pinch-zoom are blocked.
- **Websites that forbid embedding** (X-Frame-Options / frame-ancestors) cannot be shown inside Safari; they open in a new tab. YouTube's own pages are among them, so video pages are rebuilt around YouTube's official embedded player; a few videos are restricted by their owners to youtube.com.
- **YouTube search** needs a YouTube Data API v3 key (`VITE_YOUTUBE_API_KEY`, or paste one on Safari's YouTube page). Without one, Safari can play pasted links and featured videos only.
- **Google Maps** needs `VITE_GOOGLE_MAPS_API_KEY` with Maps JavaScript, Places (New), Routes and Geocoding enabled; otherwise Maps uses its offline vector map.
- **Web apps** (Instagram, WhatsApp, LinkedIn…) forbid being embedded, so they open the real site in their own browser window. A web page cannot install or run native desktop programs.
- **Hosted preview (claude.ai artifact)**: the host's content-security policy blocks other sites in frames, network requests, downloads, camera, microphone and location. In that preview Safari shows web pages as "open in new tab", Weather uses demo data, and exports fall back to Copy. Run locally or with Docker for the full experience.
- **Hardware details**: browsers do not expose CPU model, exact RAM, serial number or disk size. About This Mac labels these as unavailable rather than guessing.
- **Storage** is per browser profile (IndexedDB). Clearing site data erases the virtual disk; use Settings ▸ Time Machine ▸ Export to back it up.
- **Not implemented**: Mission Control/Spaces, Stage Manager, Siri, iCloud, Continuity, real printing, real video calling between users, Apple Pay, multiple displays.

## Features that need credentials or services

| Feature | What to provide |
|---|---|
| Accounts + preference sync | Run the backend and PostgreSQL (docker compose), build with `VITE_API_URL` |
| YouTube search in Safari | `VITE_YOUTUBE_API_KEY` (YouTube Data API v3) |
| Google Maps, Places and directions | `VITE_GOOGLE_MAPS_API_KEY` |
| Live weather | Network access to `api.open-meteo.com` (no key needed) |
| FaceTime / Photo Booth / Voice Memos | Camera or microphone permission in your browser |

## Licensing of assets

All wallpapers, icons, the system mark and sounds are original to this project. Featured YouTube videos are the Blender Foundation's Creative Commons open movies, played through YouTube's embed player. "macOS", "Safari", "Finder" and other Apple product names are used descriptively; the project is not affiliated with Apple.
