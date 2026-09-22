import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { registerViewPartials } from './web/hbs-partials';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true }));

  const viewsPath = join(__dirname, 'web', 'views');
  const publicPath = join(__dirname, 'web', 'public');
  app.setBaseViewsDir(viewsPath);
  app.setViewEngine('hbs');
  registerViewPartials(viewsPath);
  app.useStaticAssets(publicPath);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('University Library Portal API')
    .setDescription(
      'Discovery, access, reservation, and contribution API for the library portal',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>('app');
  const port = appConfig?.port ?? 3000;

  await app.listen(port);
}

void bootstrap();
