import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TranscriptModule } from '../transcript/transcript.module';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';

@Module({
  imports: [TranscriptModule, AiModule],
  controllers: [AnalyzeController],
  providers: [AnalyzeService],
  exports: [AnalyzeService],
})
export class AnalyzeModule {}
