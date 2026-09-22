import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemberType, Role } from '@prisma/client';
import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { AppConfig } from '../../config/configuration';
import { MemberService } from '../../member/service/member.service';
import { IsEnum, IsOptional, IsString } from 'class-validator';

class WebLoginDto {
  @IsString()
  sub!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsEnum(MemberType)
  memberType?: MemberType;

  @IsOptional()
  @IsString()
  next?: string;

  @IsOptional()
  @IsString()
  _csrf?: string;
}

/**
 * Dev portal login — issues the same mock SSO JWT as /auth/mock-idp/token,
 * but stores it in an HttpOnly cookie for HTML flows (Phase 6.1).
 */
@Controller()
export class WebAuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly memberService: MemberService,
  ) {}

  @Get('login')
  @Render('auth/login')
  loginForm(@Req() req: Request, @Query('next') next?: string) {
    return {
      title: 'Sign in',
      csrfToken: req.res?.locals.csrfToken,
      next: next ?? '/',
      error: undefined as string | undefined,
      roles: Object.values(Role),
    };
  }

  @Post('login')
  async login(
    @Body() body: WebLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const app = this.configService.get<AppConfig>('app');
    const secret = app?.jwt.mockIdpSigningSecret;
    if (!secret) {
      res.status(500).render('errors/generic', {
        title: 'Configuration error',
        message: 'MOCK_IDP_SIGNING_SECRET is not configured.',
        csrfToken: req.res?.locals.csrfToken,
      });
      return;
    }

    const member = await this.memberService.findBySsoSubjectId(body.sub);
    if (!member) {
      res.status(401).render('auth/login', {
        title: 'Sign in',
        csrfToken: req.res?.locals.csrfToken,
        next: body.next ?? '/',
        error: `No Member is provisioned for identity "${body.sub}".`,
        roles: Object.values(Role),
      });
      return;
    }

    const token = jwt.sign(
      {
        sub: body.sub,
        role: body.role,
        faculty: body.faculty ?? member.faculty ?? undefined,
        memberType: body.memberType ?? member.memberType,
      },
      secret,
      { algorithm: 'HS256', expiresIn: '8h' },
    );

    const cookieName = app?.web.sessionCookieName ?? 'library_token';
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: app?.web.cookieSecure ?? false,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });

    const nextPath = body.next && body.next.startsWith('/') ? body.next : '/';
    res.redirect(303, nextPath);
  }

  @Post('logout')
  logout(@Res() res: Response): void {
    const cookieName =
      this.configService.get<AppConfig>('app')?.web.sessionCookieName ??
      'library_token';
    res.clearCookie(cookieName, { path: '/' });
    res.redirect(303, '/');
  }
}
