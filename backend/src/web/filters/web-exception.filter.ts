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

    if (request.path.startsWith('/api') || request.path.startsWith('/auth/mock-idp')) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }

    const status = exception.getStatus();
    const message =
      typeof exception.getResponse() === 'string'
        ? (exception.getResponse() as string)
        : ((exception.getResponse() as { message?: string | string[] }).message ??
          exception.message);

    const text = Array.isArray(message) ? message.join(', ') : String(message);

    if (exception instanceof UnauthorizedException) {
      response.redirect(`/login?next=${encodeURIComponent(request.originalUrl)}`);
      return;
    }

    if (status === 409) {
      response.status(409).render('errors/conflict', {
        title: 'Conflict',
        message: text,
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
