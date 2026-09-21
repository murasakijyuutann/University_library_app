import { Body, Controller, InternalServerErrorException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AppConfig } from '../config/configuration';
import { MockTokenRequestDto } from './dto/mock-token-request.dto';
import { JwtClaims } from './jwt/jwt-claims';

/**
 * DEV ONLY — issues fake SSO tokens locally so the project is runnable
 * end-to-end without a real university IdP (project-structure_v3.md §2.2).
 * Registered only when NODE_ENV !== 'production' (see security.module.ts) —
 * this is the simulated SSO boundary, never a real auth system, and it never
 * checks a password because there is no credential store to check against.
 */
@Controller('auth/mock-idp')
export class MockIdpController {
  constructor(private readonly configService: ConfigService) {}

  @Post('token')
  issueToken(@Body() body: MockTokenRequestDto): { accessToken: string } {
    const secret = this.configService.get<AppConfig>('app')?.jwt.mockIdpSigningSecret;
    if (!secret) {
      throw new InternalServerErrorException('MOCK_IDP_SIGNING_SECRET is not configured.');
    }

    const claims: JwtClaims = {
      sub: body.sub,
      role: body.role,
      faculty: body.faculty,
      memberType: body.memberType,
    };
    const accessToken = jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: '1h' });
    return { accessToken };
  }
}
