# Floret — Claude plugin

Remote MCP: `https://bubbly-vibrancy-production-168d.up.railway.app/mcp`

## Install

```bash
npm run plugin:pack
```

Upload **`floret.zip`** in Claude → Plugins → Upload plugin.

| Skills | Connectors |
|--------|------------|
| `/analyse`, `/transcript` | `floret` → tools `analyze_video`, `get_transcript` |

Icon: square flower crop in `icon.png` (also under `.claude-plugin/`). Redeploy the API so `/logo.png` + `/favicon.ico` are live — Claude’s connector tile often uses the host favicon.
