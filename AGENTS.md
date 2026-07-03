# AGENTS.md — NueIngles

English Pronunciation Coach: a vanilla JS frontend + Node.js backend (ESM, zero deps). MVP / prototype — no tests, no lint, no build.

## Stack

- **Frontend** (`frontend/`): vanilla HTML/CSS/JS (ES modules, no framework). Imports use bare relative paths (`import { ... } from "./file.js"`).
- **Backend** (`backend/`): Node.js ≥18, ESM (`"type": "module"`), zero npm dependencies. Serves `frontend/` as static files + single API route.
- **`docs/`**: specification only (not code).

## Commands

| Action | Command |
|--------|---------|
| Start backend + serve frontend | `cd backend && npm start` |
| Dev with auto-restart | `cd backend && npm run dev` |
| Standalone (mock only) | Open `frontend/index.html` in browser |

Frontend at `http://localhost:5173` when backend is running. No install or build step.

## API

`POST /api/translate` with `{ text, provider?, apiKey? }` → `{ translation }`.

Backend providers (set via env var `AI_PROVIDER` or sent from frontend):
- `mock` (default, no key needed), `libretranslate`, `openai-compatible`, `generic-rest`
- Free providers selectable from frontend: `gemini`, `groq`, `openai`, `deepseek`, `moonshot`

Copy `backend/.env.example` → `backend/.env` to configure keys/URLs.

Frontend provider set via UI config panel (click "Mostrar"): `mock` (default) | `backend` | `generic`. In `backend` mode the provider + key can be forwarded to the server.

## Translation & Pronunciation

- **Backend** (`backend/server.js`): large `mockTranslations` Map for mock translation lookups.
- **Frontend** (`frontend/src/providers.js`): `fallbackTranslations` Map for word lookup; `simplifiedPronunciations` Map (~hundreds of exception words); `getSimplifiedPronunciation()` regex-based fallback for Spanish speakers.
- `getWords()` splits text, `cleanWord()` strips punctuation for matching.

## Frontend modules

| File | Role |
|------|------|
| `app.js` | Entrypoint, UI wiring, karaoke, recording orchestration |
| `audio.js` | `MediaRecorder`, `SpeechRecognition`, `SpeechSynthesis` wrappers |
| `providers.js` | Provider classes (`MockProvider`, `BackendProvider`, `GenericProvider`), pronunciation rules, word analysis |
| `waveform.js` | Per-word waveform on `<canvas>` |
| `styles.css` | All styles |

## Important constraints

- **No `.gitignore`** — treat all files in `frontend/` and `backend/` as committed source.
- **No `package-lock.json`** — zero dependencies, none is generated.
- Root `.docx`, `Captura*.PNG`, video files are user content — leave them alone.
- `docs/` content is specification, not source code.
- Voice profile (male/female/neutral) uses browser `SpeechSynthesis`; availability depends on OS/browser.

## Provider flow

1. User enters Spanish text → `providers.js` calls selected provider for translation
2. Translation is split into words; pronunciation lookup from `providers.js` map + rules
3. Karaoke reading + mic recording via `audio.js` (`MediaRecorder` + `SpeechRecognition`)
4. Evaluation uses Levenshtein-based word similarity (`analyzeByWordSimilarity()`)
5. Waveform drawn per-word in `waveform.js` on `<canvas>`
