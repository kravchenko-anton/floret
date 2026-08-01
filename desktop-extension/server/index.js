#!/usr/bin/env node

/**
 * Floret Desktop MCP (stdio) — thin proxy to the hosted Floret HTTP API.
 * Tools mirror the remote MCP / REST surface: get_transcript, analyze_video.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_BASE_URL =
  'https://bubbly-vibrancy-production-168d.up.railway.app';

function baseUrl() {
  const raw = (process.env.FLORET_BASE_URL || DEFAULT_BASE_URL).trim();
  return raw.replace(/\/+$/, '');
}

function authHeaders() {
  const key = process.env.FLORET_API_KEY?.trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

async function apiFetch(path, options = {}) {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body
        ? Array.isArray(body.message)
          ? body.message.join('; ')
          : String(body.message)
        : typeof body === 'string'
          ? body
          : `${res.status} ${res.statusText}`;
    throw new Error(`Floret API ${res.status}: ${message}`);
  }

  return body;
}

function textResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

const server = new Server(
  {
    name: 'floret',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_transcript',
      description:
        'Fetch a YouTube video transcript as a reflowed readable script (cached by video ID). Accepts an 11-character video ID or a YouTube URL.',
      inputSchema: {
        type: 'object',
        properties: {
          videoId: {
            type: 'string',
            description: 'YouTube video ID (11 chars) or full YouTube URL',
          },
          lang: {
            type: 'string',
            description: 'Preferred caption language (ISO 639-1), e.g. en',
          },
        },
        required: ['videoId'],
      },
    },
    {
      name: 'analyze_video',
      description:
        'Analyze a YouTube video script for format, angle, storytelling, hooks, and visuals. Loads/reflows the transcript if needed and caches the analysis by video ID.',
      inputSchema: {
        type: 'object',
        properties: {
          videoId: {
            type: 'string',
            description: 'YouTube video ID (11 chars) or full YouTube URL',
          },
        },
        required: ['videoId'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === 'get_transcript') {
    const videoId = String(args.videoId ?? '').trim();
    if (!videoId) throw new Error('videoId is required');
    const lang = args.lang ? String(args.lang).trim() : '';
    const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
    const data = await apiFetch(
      `/transcripts/${encodeURIComponent(videoId)}${qs}`,
    );
    return textResult(data);
  }

  if (name === 'analyze_video') {
    const videoId = String(args.videoId ?? '').trim();
    if (!videoId) throw new Error('videoId is required');
    const data = await apiFetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });
    return textResult(data);
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Floret desktop MCP proxy → ${baseUrl()}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
