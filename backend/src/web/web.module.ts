import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MemberModule } from '../member/member.module';
import { ResourceModule } from '../resource/resource.module';
import { LoanModule } from '../loan/loan.module';
import { ReservationModule } from '../reservation/reservation.module';
import { SearchModule } from '../search/search.module';
import { ThesisModule } from '../thesis/thesis.module';
import { SecurityModule } from '../security/security.module';
import { HomeController } from './controllers/home.controller';
import { WebAuthController } from './controllers/web-auth.controller';
import { WebSearchController } from './controllers/web-search.controller';
import { WebResourceController } from './controllers/web-resource.controller';
import { WebThesisController } from './controllers/web-thesis.controller';
import { ResourcePresenter } from './presenters/resource.presenter';
import { WebAuthGuard } from './guards/web-auth.guard';
import { CsrfMiddleware } from './middleware/csrf.middleware';
import { WebExceptionFilter } from './filters/web-exception.filter';

/**
 * Phase 6 HTML portal — Handlebars MVC over the proven domain services.
 * JSON /api routes stay in their domain modules; this module is presentation.
 */
@Module({
  imports: [
    SecurityModule,
    MemberModule,
    ResourceModule,
    LoanModule,
    ReservationModule,
    SearchModule,
    ThesisModule,
  ],
  controllers: [
    HomeController,
    WebAuthController,
    WebSearchController,
    WebResourceController,
    WebThesisController,
  ],
  providers: [
    ResourcePresenter,
    WebAuthGuard,
    { provide: APP_FILTER, useClass: WebExceptionFilter },
  ],
})
export class WebModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply only to portal HTML routes — never blanket `*` (that can strip
    // req.path and accidentally CSRF-check /auth/mock-idp and /api).
    consumer.apply(CsrfMiddleware).forRoutes(
      HomeController,
      WebAuthController,
      WebSearchController,
      WebResourceController,
      WebThesisController,
      { path: '/', method: RequestMethod.ALL },
    );
  }
}
