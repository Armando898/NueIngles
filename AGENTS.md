# AGENTS.md — NueIngles

English Pronunciation Coach: a vanilla JS frontend + Node.js backend (ESM, zero deps). MVP / prototype — no build, no tests, no CI.

## Stack

- **Frontend** (`frontend/`): vanilla HTML/CSS/JS (ES modules, no framework).
- **Backend** (`backend/`): Node.js ≥18, ESM (`"type": "module"`), zero npm dependencies. Static file server + single API route.
- `docs/`: specification only (not code).

## Commands

| Action | Command |
|--------|---------|
| Start backend + serve frontend | `cd backend && npm start` |
| Dev with auto-restart | `cd backend && npm run dev` |
| Open standalone (mock only) | Open `frontend/index.html` in browser |

Frontend works at `http://localhost:5173` when backend is running. No install or build step needed.

## Architecture

- **Single API route**: `POST /api/translate` with `{ text: "..." }` → `{ translation: "..." }`.
- **AI provider** selected via `AI_PROVIDER` env var (`mock` / `openai-compatible` / `generic-rest`). Copy `backend/.env.example` → `.env` to configure.
- **Frontend provider** selected via UI config panel (click "Mostrar"): `mock` / `backend` / `generic`. `backend` mode calls the local server. API keys never exposed client-side except in `generic` mode.
- `mock` is the default everywhere — no keys needed.
- Voice profile (male/female/neutral) uses browser's `SpeechSynthesis`; voice availability depends on OS/browser.

## Important constraints

- **No tests, no lint, no formatter, no typecheck.** Do not look for them or add them unless asked.
- **No `.gitignore`** — treat files in `frontend/` and `backend/` as committed source. The root `.docx` file is user content — leave it alone.
- **No `package-lock.json`** — there are zero dependencies, so none is generated.
- Frontend uses bare ES module imports (`import { ... } from "./file.js"`) — no bundler, no path aliases. Keep imports relative.

## Provider flow

1. User enters Spanish text in `frontend/`
2. `providers.js` calls the selected provider (mock / backend / generic) to translate
3. Translation is split into words; simplified pronunciation lookup from `providers.js` map
4. Karaoke-style reading + mic recording uses `audio.js` (browser `MediaRecorder` + `SpeechRecognition`)
5. Waveform drawn per-word in `waveform.js` on a `<canvas>`
