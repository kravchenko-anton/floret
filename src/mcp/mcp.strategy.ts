import {
  MCP_STRATEGY,
  McpStrategy,
  StreamableHttpTransport,
} from '@rekog/mcp-nest';

export const mcpTransport = new StreamableHttpTransport();

/** Public origin used for MCP icons / website (no trailing slash). */
const publicBaseUrl = (
  process.env.PUBLIC_BASE_URL ??
  'https://bubbly-vibrancy-production-168d.up.railway.app'
).replace(/\/+$/, '');

export const mcp = new McpStrategy({
  name: 'floret',
  version: '1.1.0',
  title: 'Floret',
  description:
    'YouTube transcript and script analysis tools (hooks, format, storytelling).',
  websiteUrl: publicBaseUrl,
  icons: [
    {
      src: `${publicBaseUrl}/logo.png`,
      mimeType: 'image/png',
      sizes: ['512x512'],
    },
  ],
  transports: [mcpTransport],
});

export const mcpStrategyProvider = {
  provide: MCP_STRATEGY,
  useValue: mcp,
};
