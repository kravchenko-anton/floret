import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AnalyzeModule } from './analyze/analyze.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TranscriptModule } from './transcript/transcript.module';

@Module({
  imports: [SentryModule.forRoot(), TranscriptModule, AnalyzeModule],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    AppService,
  ],
})
export class AppModule {}
