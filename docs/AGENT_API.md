# Floret API — Agent Integration Guide

Hand this document to any agent building a client (landing page, dashboard, mobile app, bot). It is the contract for **Floret**, a NestJS YouTube tooling API.

Interactive OpenAPI (non-production only):

- Spec: `GET /openapi.json`
- UI: `GET /reference`

Base URL: use the deployed host (or `http://localhost:3000` locally). All paths below are absolute from that origin. **No auth headers** are required for public endpoints today.

---

## Endpoints overview

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/transcripts/:videoId` | Fetch YouTube captions (cached) |
| `POST` | `/analyze` | Analyze transcript for hooks / CTAs / rehooks (cached) |
| `POST` | `/votes` | Cast one interest vote for an upcoming feature |
| `GET` | `/votes` | Read vote totals per feature |

Ignore `GET /` and `GET /debug-sentry` — internal / health noise, not for product clients.

---

## 1. Votes (feature interest)

Use this for a simple “what should we build next?” poll.

### Allowed `purpose` values (exact strings)

| `purpose` | Meaning |
|-----------|---------|
| `name_logo_creation` | Name + logo creation |
| `niche_finding` | Niche finding |
| `audience_pain_points` | Audience pain points |
| `research_tool` | Research tool |
| `script_writing_tool` | YouTube script writing tool |

Do **not** invent other purpose strings. Typos → `422`.

### `POST /votes` — cast a vote

**Request**

```http
POST /votes
Content-Type: application/json

{ "purpose": "script_writing_tool" }
```

**Success `200`**

```json
{
  "purpose": "script_writing_tool",
  "counted": true,
  "total": 42
}
```

| Field | Type | Notes |
|-------|------|--------|
| `purpose` | string | Echo of accepted purpose |
| `counted` | boolean | Always `true` on success |
| `total` | number | Total votes for that purpose **after** this vote |

**Errors**

| Status | When | Client action |
|--------|------|----------------|
| `409 Conflict` | This visitor already voted for this purpose | Show “already voted”; do not retry |
| `422 Unprocessable Entity` | Unknown `purpose`, or client IP could not be resolved | Fix payload / check proxy |

Example `409` body (Nest default shape):

```json
{
  "statusCode": 409,
  "message": "Already voted for this purpose. One vote per purpose per visitor — spam is not allowed.",
  "error": "Conflict"
}
```

### Anti-spam rules (must communicate in UI)

- **One vote per purpose per visitor.**
- Identity = **client IP** (from `X-Forwarded-For` first hop, else socket IP). Server stores **SHA-256(IP)** only — never raw IP.
- Same person can vote for **different** purposes (one each).
- Same purpose again → **409**, vote is **not** incremented.
- There is **no** undo, no anonymous multi-vote bypass, no API key override for clients.

**UI recommendations**

1. On click: `POST /votes` with the purpose.
2. On `200`: mark that purpose as voted locally; update displayed count from `total` (or refetch `GET /votes`).
3. On `409`: treat as already voted; disable that button permanently for the session (and ideally persist a local flag).
4. Do not spam-click or auto-retry on `409`.
5. Prefer calling from the **browser/user device** so the real visitor IP is used. Server-side / shared proxy votes collapse many users into one IP.

### `GET /votes` — totals

**Request**

```http
GET /votes
```

**Success `200`**

```json
{
  "counts": {
    "name_logo_creation": 3,
    "niche_finding": 7,
    "audience_pain_points": 12,
    "research_tool": 5,
    "script_writing_tool": 21
  }
}
```

All five keys are **always** present; missing purposes are `0`.

Use this to render the poll on load. After a successful `POST`, you may trust `total` for that one purpose without refetching.

### Minimal client examples

```ts
// Cast
const res = await fetch(`${BASE}/votes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ purpose: 'script_writing_tool' }),
});
if (res.status === 409) {
  // already voted — disable UI for this purpose
}
if (!res.ok) throw new Error(await res.text());
const data = await res.json(); // { purpose, counted, total }

// Totals
const { counts } = await fetch(`${BASE}/votes`).then((r) => r.json());
```

```bash
curl -s -X POST "$BASE/votes" \
  -H 'Content-Type: application/json' \
  -d '{"purpose":"niche_finding"}'

curl -s "$BASE/votes"
```

---

## 2. Transcripts

### `GET /transcripts/:videoId`

| Param / query | Required | Notes |
|---------------|----------|--------|
| `videoId` | yes | YouTube video ID (11 chars) or extractable URL/id the service accepts |
| `lang` | no | Preferred caption language, ISO 639-1 (e.g. `en`) |

**Success `200`**

```json
{
  "videoId": "dQw4w9WgXcQ",
  "language": "en",
  "segments": [
    { "text": "Hey there", "duration": 1.54, "offset": 0, "lang": "en" }
  ],
  "text": "Hey there How are you"
}
```

| Field | Notes |
|-------|--------|
| `segments[].offset` | Start time in **seconds** |
| `segments[].duration` | Length in **seconds** |
| `text` | Joined full transcript |

**Errors**

| Status | Meaning |
|--------|---------|
| `404` | No captions for this video |
| `422` | Invalid video ID |
| `503` | Apify / upstream unavailable or misconfigured |

Results are **cached by video ID** — safe to call repeatedly for the same video.

---

## 3. Analyze (hooks / CTAs / rehooks)

### `POST /analyze`

**Request**

```http
POST /analyze
Content-Type: application/json

{ "videoId": "dQw4w9WgXcQ" }
```

**Success `200`**

```json
{
  "text": "0:00  Intro\n\nThis is the spoken script…\nNext sentence.",
  "highlights": [
    {
      "type": "hook",
      "start": 0,
      "end": 42,
      "quote": "Hey, stop scrolling for a second"
    }
  ],
  "analysis": "Strong opening hook…"
}
```

| Field | Notes |
|-------|--------|
| `text` | Script format: **one sentence per line**. If chapters exist, section headers look like `MM:SS  Title` (timestamp, **two spaces**, title). |
| `highlights[].type` | `"hook"` \| `"cta"` \| `"rehook"` only |
| `highlights[].start` / `end` | Character offsets into `text` (start inclusive, end exclusive). `quote === text.slice(start, end)`. |
| `analysis` | Plain-text retention / structure assessment |

**Errors**

| Status | Meaning |
|--------|---------|
| `401` | AI provider auth failed |
| `422` | Invalid video ID or invalid AI JSON |
| `503` | Transcript or AI upstream unavailable |

Results are **cached by `youtubeId`**. Prefer reusing cached output; do not assume every call hits the model.

**Client tip for rendering highlights:** bind UI selection to `start`/`end` on `text`, and use `quote` as display fallback. Do not invent offsets.

---

## Error shape (NestJS)

Unless noted otherwise, errors look like:

```json
{
  "statusCode": 409,
  "message": "human-readable string or string[]",
  "error": "Conflict"
}
```

Always branch on **HTTP status**, not message text.

---

## CORS / proxy notes for vote anti-spam

Floret enables CORS with an explicit origin allowlist so the **browser can call Floret directly**.

- Always allowed: `http://localhost:3000`, `http://127.0.0.1:3000`, `https://youtube-script.antonkzavcenco300.workers.dev`
- Extra origins: set `CORS_ORIGINS` (comma-separated), e.g. `https://www.example.com`
- Methods: `GET`, `POST`, `OPTIONS`. Allowed headers: `Content-Type`, `Accept`

**Prefer this path for votes**

- `GET /votes` and especially `POST /votes`: call Floret from the **user’s browser** so anti-spam hashes the visitor IP.
- A backend BFF / Next.js proxy collapses many users into one IP unless you carefully forward `X-Forwarded-For` / `cf-connecting-ip` — fragile; avoid for `POST /votes`.
- `GET /votes` (totals only, no identity) may go through a proxy if you must; still prefer direct once CORS includes your frontend origin.

Production sits behind a reverse proxy; Floret trusts `X-Forwarded-For` (`trust proxy`). Do not strip that header if you put another proxy in front of Floret.

If the browser shows “No Access-Control-Allow-Origin”, add the frontend origin to `CORS_ORIGINS` on the Floret deploy and redeploy.

---

## What not to build against

- Do not store or send raw voter IPs; the API does not accept a voter id body field.
- Do not add custom purpose enums in the client beyond the five listed — server is source of truth (`src/db/schema/votes.ts` → `VOTE_PURPOSES`).
- Do not treat `counted: false` as a success mode — success always returns `counted: true`; duplicates are `409`.
- Do not call `POST /votes` in a loop “to be sure.”

---

## Source map (for agents editing Floret itself)

| Area | Path |
|------|------|
| Vote controller | `src/vote/vote.controller.ts` |
| Vote service | `src/vote/vote.service.ts` |
| Vote purposes + DB table | `src/db/schema/votes.ts` |
| Migration | `drizzle/0002_remarkable_the_leader.sql` |
| Analyze | `src/analyze/` |
| Transcripts | `src/transcript/` |
| App wiring | `src/app.module.ts`, `src/main.ts` |

Env template: `.env.example` (`DATABASE_URL`, `DASHSCOPE_*`, `APIFY_*`, `CORS_ORIGINS`, optional `SENTRY_DSN`).
