import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../../config/configuration';

/**
 * Double-submit CSRF for HTML form posts (Phase 6.1).
 * JSON API (`/api`) and mock IdP (`/auth`) must never hit this check.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const path = (req.originalUrl ?? req.url ?? req.path).split('?')[0];
    if (
      path.startsWith('/api') ||
      path.startsWith('/auth') ||
      path.startsWith('/_local-storage')
    ) {
      next();
      return;
    }

    const web = this.configService.get<AppConfig>('app')?.web;
    const cookieName = web?.csrfCookieName ?? 'csrf_token';
    const secure = web?.cookieSecure ?? false;

    let token = req.cookies?.[cookieName] as string | undefined;
    if (!token) {
      token = randomBytes(24).toString('hex');
      res.cookie(cookieName, token, {
        httpOnly: false,
        sameSite: 'lax',
        secure,
        path: '/',
      });
    }
    res.locals.csrfToken = token;

    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }

    const submitted =
      (req.body as { _csrf?: string } | undefined)?._csrf ??
      (req.headers['x-csrf-token'] as string | undefined);
    if (!submitted || submitted !== token) {
      throw new ForbiddenException('CSRF validation failed.');
    }
    next();
  }
}
