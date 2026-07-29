import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import OpenAI from 'openai';

const DEFAULT_MODEL = 'qwen-plus';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_BASE_URL =
  'https://ws-bhz61zoeuyveb9s3.eu-central-1.maas.aliyuncs.com/compatible-mode/v1';

@Injectable()
export class AiService {
  private readonly apiKey =
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.ALIBABA_API_KEY?.trim();
  readonly model =
    process.env.DASHSCOPE_MODEL?.trim() ||
    process.env.ALIBABA_MODEL?.trim() ||
    DEFAULT_MODEL;
  private readonly baseURL =
    process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_BASE_URL;
  private readonly maxCompletionTokens = Number(
    process.env.DASHSCOPE_MAX_TOKENS ?? DEFAULT_MAX_TOKENS,
  );
  private client: OpenAI | null = null;

  constructor(
    @InjectPinoLogger(AiService.name)
    private readonly logger: PinoLogger,
  ) {}

  async generateJson(
    systemInstruction: string,
    userText: string,
  ): Promise<string> {
    if (!this.apiKey) {
      this.logger.error({ model: this.model }, 'DASHSCOPE_API_KEY is missing');
      throw new ServiceUnavailableException('DASHSCOPE_API_KEY is required');
    }

    const openai = this.getClient();

    try {
      const result = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userText },
        ],
        temperature: 0.6,
        max_tokens: Number.isFinite(this.maxCompletionTokens)
          ? this.maxCompletionTokens
          : DEFAULT_MAX_TOKENS,
        top_p: 0.95,
        stream: false,
      });

      const text = result.choices?.[0]?.message?.content?.trim();
      if (!text) {
        this.logger.error(
          { model: this.model },
          'Alibaba Model Studio returned an empty response',
        );
        throw new ServiceUnavailableException(
          'Alibaba Model Studio returned an empty response',
        );
      }

      return text;
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      const message = this.formatError(error);
      const status = this.statusFromError(error);

      if (
        status === 401 ||
        status === 403 ||
        /unauthorized|401|403|api key|invalid.*key/i.test(message)
      ) {
        this.logger.error(
          { model: this.model, message, status },
          'Alibaba Model Studio authentication failed',
        );
        throw new UnauthorizedException(
          `Alibaba Model Studio authentication failed: ${message}`,
        );
      }

      this.logger.error(
        { model: this.model, message, status },
        'Alibaba Model Studio request failed',
      );
      throw new ServiceUnavailableException(
        `Alibaba Model Studio request failed: ${message}`,
      );
    }
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey!,
        baseURL: this.baseURL,
      });
    }
    return this.client;
  }

  private statusFromError(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }

  private formatError(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return String(error);
    }

    const err = error as {
      message?: string;
      error?: { message?: string; code?: string | number };
    };

    if (err.error?.message) {
      return err.error.code
        ? `${err.error.message} (code ${err.error.code})`
        : err.error.message;
    }

    return error instanceof Error ? error.message : String(error);
  }
}
