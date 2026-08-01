---
name: transcript-analysis
description: Fetch a YouTube video transcript as a reflowed readable script via Floret (captions + AI script formatting).
---

# Transcript analysis (Floret)

When the user wants the transcript, captions, or reflowed script for a YouTube video (without full analysis), use the Floret MCP tool:

1. Call `get_transcript` with `videoId` set to the YouTube URL or 11-character video ID.
2. Optional `lang` for preferred caption language (ISO 639-1, e.g. `en`).
3. Return the script text clearly; include `videoId` / language when useful.
4. Do not invent dialogue — only use what the tool returns.
