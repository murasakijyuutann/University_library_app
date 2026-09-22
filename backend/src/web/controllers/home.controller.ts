import { Controller, Get, Render, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Member } from '@prisma/client';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { WebAuthGuard } from '../guards/web-auth.guard';

@Controller()
export class HomeController {
  @Get()
  @Render('home')
  home(@Req() req: Request) {
    return {
      title: 'University Library Portal',
      csrfToken: req.res?.locals.csrfToken,
    };
  }

  @Get('account')
  @UseGuards(WebAuthGuard, LoadMemberGuard)
  @Render('account')
  account(@Req() req: Request, @CurrentMember() member: Member) {
    return {
      title: 'Your account',
      csrfToken: req.res?.locals.csrfToken,
      member: {
        fullName: member.fullName,
        email: member.email,
        role: member.role,
        faculty: member.faculty,
      },
    };
  }
}
