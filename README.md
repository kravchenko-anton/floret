# Floret

YouTube transcript + script analysis API for creators, agents, and Claude/Cursor connectors.

**Live API:** [bubbly-vibrancy-production-168d.up.railway.app](https://bubbly-vibrancy-production-168d.up.railway.app)  
**Agent contract:** [`docs/AGENT_API.md`](docs/AGENT_API.md)

---

## Features

### Transcripts
Fetch YouTube captions by video ID or URL. Returns timed segments plus a full reflowed script. Results are cached per video so repeat calls stay cheap.

- `GET /transcripts/:videoId` — optional `lang` (ISO 639-1)
- MCP tool: `get_transcript`

### Script analysis
AI analysis of how a video is built — format, topic/angle, storytelling moves, hooks, and visual layout. Cached per video.

- `POST /analyze` — body `{ "videoId": "…" }`
- MCP tool: `analyze_video`
- Claude skill: `/analyze`

Output covers:

| Field | What you get |
|-------|----------------|
| `format` | educational / entertainment / mixed + flavor |
| `topicAndAngle` | topic, angle, belief challenged, constrained reality |
| `storytellingStructure` | ordered key moves |
| `hookAnalysis` | how the open holds attention |
| `visualLayout` | category + style notes |

### Feature voting
Simple “what should we build next?” poll with one vote per purpose per visitor (IP hashed, never stored raw).

- `POST /votes` / `GET /votes`
- Purposes: name + logo, niche finding, audience pain points, research tool, script writing tool

### Remote MCP
Same Nest process exposes Streamable HTTP MCP at `/mcp` for Claude, Claude Code, Cursor, and similar clients.

| Tool | Does |
|------|------|
| `get_transcript` | Full captions / script |
| `analyze_video` | Structured script analysis |

Optional `MCP_API_KEY` → require `Authorization: Bearer …`. Unset → open like the public REST API.

### Claude plugin
Uploadable plugin with skills + remote connector:

```bash
npm run plugin:pack
# → claude-plugin/floret.zip
```

Claude → **Plugins** → **Upload plugin** → `floret.zip`

| Skills | Connector tools |
|--------|-----------------|
| `/analyze`, `/transcript` | `analyze_video`, `get_transcript` |

---

## Quick start

```bash
cp .env.example .env
# set DATABASE_URL, DASHSCOPE_API_KEY, APIFY_TOKEN

npm install
npm run docker:up    # local Postgres
npm run db:migrate
npm run start:dev
```

OpenAPI (non-production): `GET /openapi.json` · `GET /reference`

### Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run start:dev` | Nest watch mode |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run plugin:pack` | Build Claude `floret.zip` |
| `npm run mcpb:pack` | Build Claude Desktop `.mcpb` |
| `npm run docker:full` | App + DB via Compose |

---

## Stack

- **NestJS** API + OpenAPI/Scalar reference
- **Postgres** + Drizzle ORM (transcripts, analyses, votes)
- **Apify** for YouTube transcripts
- **Alibaba Model Studio** (DashScope / Qwen) for analysis
- **MCP** (`@rekog/mcp-nest`) for agent connectors
- Optional **Sentry**

---

## Connect MCP clients

**Claude custom connector:** paste `https://<host>/mcp`

**Claude Code:**

```bash
claude mcp add --transport http floret https://<host>/mcp
```

**Cursor:** add a remote MCP server pointing at the same `/mcp` URL.

---

## License

MIT (Claude plugin). API package is private / unlicensed in `package.json` unless you change that.
