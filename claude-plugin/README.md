# Floret — Claude plugin

Uploadable Claude **plugin** (`.zip`) for Cowork / Plugins UI. Connects to the hosted Floret MCP endpoint:

`https://bubbly-vibrancy-production-168d.up.railway.app/mcp`

## Install

1. Build: from repo root run `npm run plugin:pack`
2. In Claude → **Plugins** → **Add** → **Upload plugin**
3. Upload **`floret.zip`** (not `.mcpb`)
4. Re-upload after changes (same name `floret` overwrites)

### What you should see

| Tab | Items |
|-----|--------|
| **Skills** | `/transcript-analysis`, `/youtube-script-analysis` |
| **Connectors** | `floret` (Web) — MCP tools `get_transcript`, `analyze_video` |

Logo: `icon.png` in this package + hosted `https://…/logo.png` / `favicon.ico` on the API (deploy Nest with `public/`). Claude’s connector UI may still show a generic icon until it respects plugin/`serverInfo` icons.

Tools: `get_transcript`, `analyze_video`.

## Note

- **Plugins UI** wants `.zip` / `.plugin` — use this package.
- **Claude Desktop Extensions** want `.mcpb` — use `desktop-extension/floret-1.0.0.mcpb` instead.
