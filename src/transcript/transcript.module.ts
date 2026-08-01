import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ScriptReflowService } from './script-reflow';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';

@Module({
  imports: [AiModule],
  controllers: [TranscriptController],
  providers: [TranscriptService, ScriptReflowService],
  exports: [TranscriptService],
})
export class TranscriptModule {}
