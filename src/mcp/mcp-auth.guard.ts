import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * When MCP_API_KEY is set, require `Authorization: Bearer <key>` on /mcp.
 * When unset, allow all requests (matches public REST today).
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.MCP_API_KEY?.trim();
    if (!expected) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header. Use: Bearer <MCP_API_KEY>',
      );
    }

    const token = header.slice('Bearer '.length).trim();
    if (token !== expected) {
      throw new UnauthorizedException('Invalid MCP API key');
    }

    return true;
  }
}
