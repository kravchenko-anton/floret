import { Controller, UseGuards } from '@nestjs/common';
import { McpHttpControllerFor } from '@rekog/mcp-nest';
import { McpAuthGuard } from './mcp-auth.guard';
import { mcpTransport } from './mcp.strategy';

@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpHttpController extends McpHttpControllerFor(mcpTransport) {}
