import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

const DEFAULT_MODEL = 'inclusionai/ling-3.0-flash:free';

type ChatResult = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
    };
  }>;
};

@Injectable()
export class AiService {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  readonly model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  private clientPromise: Promise<InstanceType<
    typeof import('@openrouter/sdk').OpenRouter
  > | null> | null = null;

  async generateJson(
    systemInstruction: string,
    userText: string,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('OPENROUTER_API_KEY is required');
    }

    const openrouter = await this.getClient();

    try {
      // Free Nvidia endpoints often reject response_format; prompt enforces JSON instead.
      const result = (await openrouter.chat.send({
        httpReferer: process.env.OPENROUTER_HTTP_REFERER,
        appTitle: process.env.OPENROUTER_X_TITLE,
        chatRequest: {
          model: this.model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userText },
          ],
          temperature: 0,
          stream: false,
        },
      })) as ChatResult;

      const text = this.extractContent(result);
      if (!text) {
        throw new ServiceUnavailableException(
          'OpenRouter returned an empty response',
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

      const message = this.formatOpenRouterError(error);

      if (/unauthorized|401|403|api key/i.test(message)) {
        throw new UnauthorizedException(
          `OpenRouter authentication failed: ${message}`,
        );
      }

      throw new ServiceUnavailableException(
        `OpenRouter request failed: ${message}`,
      );
    }
  }

  private formatOpenRouterError(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return String(error);
    }

    const rawValue = (error as { rawValue?: unknown }).rawValue;
    if (rawValue && typeof rawValue === 'object') {
      const apiError = (rawValue as { error?: { message?: string; code?: number } })
        .error;
      if (apiError?.message) {
        return apiError.code
          ? `${apiError.message} (code ${apiError.code})`
          : apiError.message;
      }
    }

    return error instanceof Error ? error.message : String(error);
  }

  private async getClient() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { OpenRouter } = await import('@openrouter/sdk');
        return new OpenRouter({
          apiKey: this.apiKey!,
        });
      })();
    }

    const client = await this.clientPromise;
    if (!client) {
      throw new ServiceUnavailableException('Failed to init OpenRouter client');
    }
    return client;
  }

  private extractContent(result: ChatResult): string | undefined {
    const content = result.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
    }

    return undefined;
  }
}
