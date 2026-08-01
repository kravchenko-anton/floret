import { Module } from '@nestjs/common';
import { AnalyzeModule } from '../analyze/analyze.module';
import { TranscriptModule } from '../transcript/transcript.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpHttpController } from './mcp.http.controller';
import { mcpStrategyProvider } from './mcp.strategy';
import { McpToolsController } from './mcp.tools.controller';

@Module({
  imports: [TranscriptModule, AnalyzeModule],
  controllers: [McpHttpController, McpToolsController],
  providers: [mcpStrategyProvider, McpAuthGuard],
})
export class McpModule {}
