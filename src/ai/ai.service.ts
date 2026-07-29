import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Groq } from 'groq-sdk';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

const DEFAULT_MODEL = 'qwen/qwen3.6-27b';
const DEFAULT_MAX_TOKENS = 8192;

@Injectable()
export class AiService {
  private readonly apiKey = process.env.GROQ_API_KEY?.trim();
  readonly model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
  private readonly maxCompletionTokens = Number(
    process.env.GROQ_MAX_COMPLETION_TOKENS ?? DEFAULT_MAX_TOKENS,
  );
  private client: Groq | null = null;

  constructor(
    @InjectPinoLogger(AiService.name)
    private readonly logger: PinoLogger,
  ) {}

  async generateJson(
    systemInstruction: string,
    userText: string,
  ): Promise<string> {
    if (!this.apiKey) {
      this.logger.error({ model: this.model }, 'GROQ_API_KEY is missing');
      throw new ServiceUnavailableException('GROQ_API_KEY is required');
    }

    const groq = this.getClient();

    try {
      const result = await groq.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userText },
        ],
        temperature: 0.6,
        max_completion_tokens: Number.isFinite(this.maxCompletionTokens)
          ? this.maxCompletionTokens
          : DEFAULT_MAX_TOKENS,
        top_p: 0.95,
        stream: false,
        reasoning_effort: 'default',
      });

      const text = result.choices?.[0]?.message?.content?.trim();
      if (!text) {
        this.logger.error(
          { model: this.model },
          'Groq returned an empty response',
        );
        throw new ServiceUnavailableException('Groq returned an empty response');
      }

      return text;
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      const message = this.formatGroqError(error);
      const status = this.statusFromError(error);

      if (
        status === 401 ||
        status === 403 ||
        /unauthorized|401|403|api key|invalid.*key/i.test(message)
      ) {
        this.logger.error(
          { model: this.model, message, status },
          'Groq authentication failed',
        );
        throw new UnauthorizedException(
          `Groq authentication failed: ${message}`,
        );
      }

      this.logger.error(
        { model: this.model, message, status },
        'Groq request failed',
      );
      throw new ServiceUnavailableException(`Groq request failed: ${message}`);
    }
  }

  private getClient(): Groq {
    if (!this.client) {
      this.client = new Groq({ apiKey: this.apiKey! });
    }
    return this.client;
  }

  private statusFromError(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }

  private formatGroqError(error: unknown): string {
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

