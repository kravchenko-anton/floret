# Floret — Claude Desktop extension (`.mcpb`)

Thin local MCP proxy with the same tools as the remote Floret MCP (`get_transcript`, `analyze_video`). It calls your hosted API and returns JSON results.

Default backend: `https://bubbly-vibrancy-production-168d.up.railway.app`

## Build

```bash
cd desktop-extension
npm install
npx @anthropic-ai/mcpb pack .
```

Output: `floret-1.0.0.mcpb` in this folder.

## Install in Claude Desktop

1. Open **Claude Desktop** → **Settings** → **Extensions**
2. **Drag and drop** `floret-1.0.0.mcpb` onto the window (or double-click the file)
3. Confirm install; set **Floret API base URL** if needed (defaults to Railway)
4. Optional: API key if you enabled `MCP_API_KEY` on the server (REST tools work without it today)

Then ask Claude to analyze a YouTube URL — it should call `analyze_video` / `get_transcript`.

## Tools → API

| Tool | HTTP |
|------|------|
| `get_transcript` | `GET /transcripts/:videoId?lang=` |
| `analyze_video` | `POST /analyze` `{ "videoId" }` |
