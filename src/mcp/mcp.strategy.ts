import {
  MCP_STRATEGY,
  McpStrategy,
  StreamableHttpTransport,
} from '@rekog/mcp-nest';

export const mcpTransport = new StreamableHttpTransport();

export const mcp = new McpStrategy({
  name: 'floret',
  version: '1.0.0',
  title: 'Floret',
  description:
    'YouTube transcript and script analysis tools (hooks, format, storytelling).',
  transports: [mcpTransport],
});

export const mcpStrategyProvider = {
  provide: MCP_STRATEGY,
  useValue: mcp,
};
