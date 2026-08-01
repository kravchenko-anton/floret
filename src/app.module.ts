import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AnalyzeModule } from './analyze/analyze.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { McpModule } from './mcp/mcp.module';
import { TranscriptModule } from './transcript/transcript.module';
import { VoteModule } from './vote/vote.module';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
        transport: isProd
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                singleLine: true,
                colorize: true,
                translateTime: 'SYS:standard',
              },
            },
        autoLogging: true,
        quietReqLogger: true,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'APIFY_TOKEN',
            'DASHSCOPE_API_KEY',
          ],
          remove: true,
        },
      },
    }),
    SentryModule.forRoot(),
    TranscriptModule,
    AnalyzeModule,
    VoteModule,
    McpModule,
  ],
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
