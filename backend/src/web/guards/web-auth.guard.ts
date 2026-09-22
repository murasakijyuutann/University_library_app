import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';

/**
 * JWT auth for HTML routes — on failure redirects to /login instead of 401 JSON.
 */
@Injectable()
export class WebAuthGuard extends AuthGuard('jwt') implements CanActivate {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    try {
      const ok = (await super.canActivate(context)) as boolean;
      return ok;
    } catch {
      const next = encodeURIComponent(request.originalUrl || '/');
      response.redirect(`/login?next=${next}`);
      return false;
    }
  }

  override handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
