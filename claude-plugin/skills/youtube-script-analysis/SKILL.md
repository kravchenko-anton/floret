---
name: youtube-script-analysis
description: Full Floret analysis of a YouTube script — format, angle, storytelling, hooks, and visuals (uses analyze_video).
---

# YouTube script analysis (Floret)

When the user wants analysis of a YouTube video (hooks, format, angle, storytelling, visuals) — not just the raw transcript — use Floret:

1. Call `analyze_video` with `videoId` (URL or 11-character ID).
2. For transcript-only requests, use the `transcript-analysis` skill / `get_transcript` tool instead.
3. Summarize structured fields (format, topicAndAngle, storytellingStructure, hookAnalysis, visualLayout) without inventing quotes or offsets.
