---
name: transcript
description: Fetch a YouTube transcript with Floret and paste the full script — never summarize.
---

# Transcript

When the user wants a transcript / captions / script for a YouTube video:

1. Call Floret MCP tool `get_transcript` with `videoId` (URL or 11-character ID). Optional `lang` (ISO 639-1).
2. After the tool returns, reply with the **entire** transcript text from the result (`text` field, or full segments joined in order).
3. **Do not** summarize, overview, paraphrase, bullet “key features”, or analyze. Paste the full reflowed script as-is.
4. You may add one short lead-in line (e.g. video id / language), then the full transcript in a fenced code block or plain text.
5. Only if the tool errors, explain the error — never invent dialogue.
