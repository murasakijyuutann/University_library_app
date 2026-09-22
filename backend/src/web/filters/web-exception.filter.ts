import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * HTML-friendly errors for portal routes. API paths keep Nest's default JSON.
 */
@Catch(HttpException)
export class WebExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    if (
      request.path.startsWith('/api') ||
      request.path.startsWith('/auth/mock-idp') ||
      request.path.startsWith('/_local-storage')
    ) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }

    const status = exception.getStatus();
    const raw = exception.getResponse();
    const payload =
      typeof raw === 'string'
        ? { message: raw }
        : (raw as { message?: string | string[]; returnTo?: string });
    const message = payload.message ?? exception.message;
    const text = Array.isArray(message) ? message.join(', ') : String(message);
    const returnTo =
      payload.returnTo ??
      (typeof request.headers.referer === 'string' ? request.headers.referer : undefined);

    if (exception instanceof UnauthorizedException) {
      response.redirect(`/login?next=${encodeURIComponent(request.originalUrl)}`);
      return;
    }

    if (status === 409) {
      response.status(409).render('errors/conflict', {
        title: 'Conflict',
        message: text,
        returnTo,
        csrfToken: response.locals.csrfToken,
      });
      return;
    }

    if (exception instanceof ForbiddenException || status === 403) {
      response.status(403).render('errors/forbidden', {
        title: 'Forbidden',
        message: text,
        csrfToken: response.locals.csrfToken,
      });
      return;
    }

    response.status(status).render('errors/generic', {
      title: `Error ${status}`,
      message: text,
      csrfToken: response.locals.csrfToken,
    });
  }
}
