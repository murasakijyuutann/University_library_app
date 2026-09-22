import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { LocalObjectStorageService } from './local-object-storage.service';
import { LocalStorageController } from './local-storage.controller';
import { OBJECT_STORAGE } from './object-storage.port';
import { S3ObjectStorageService } from './s3-object-storage.service';

const storageProviders = [
  LocalObjectStorageService,
  {
    provide: OBJECT_STORAGE,
    inject: [ConfigService, LocalObjectStorageService],
    useFactory: (config: ConfigService, local: LocalObjectStorageService) => {
      const driver = config.get<AppConfig>('app')?.storage.driver ?? 'local';
      if (driver === 's3') {
        return new S3ObjectStorageService(config);
      }
      return local;
    },
  },
];

@Global()
@Module({
  providers: storageProviders,
  exports: [OBJECT_STORAGE, LocalObjectStorageService],
})
export class StorageModule {
  /** Registers the local PUT endpoint only when STORAGE_DRIVER=local. */
  static forRoot(): DynamicModule {
    const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
    return {
      module: StorageModule,
      global: true,
      controllers: driver === 's3' ? [] : [LocalStorageController],
      providers: storageProviders,
      exports: [OBJECT_STORAGE, LocalObjectStorageService],
    };
  }
}
