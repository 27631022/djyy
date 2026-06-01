import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { StoragePublicController } from './storage-public.controller';
import {
  STORAGE_DRIVER,
  type StorageDriver,
} from './drivers/storage-driver.interface';
import { LocalDiskDriver } from './drivers/local-disk.driver';
import { SynologyDriver } from './drivers/synology.driver';
import { S3Driver } from './drivers/s3.driver';

/**
 * 文件存储模块。按 env `STORAGE_DRIVER`(默认 local)选定具体 driver 注入 StorageService。
 * 切后端 = 改 env(+ 实现对应 driver),消费方零改动。
 */
@Module({
  controllers: [StorageController, StoragePublicController],
  providers: [
    StorageService,
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageDriver => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local');
        switch (driver) {
          case 'synology':
            return new SynologyDriver();
          case 's3':
            return new S3Driver();
          case 'local':
          default: {
            const dir = config.get<string>('STORAGE_LOCAL_DIR', './storage-data');
            return new LocalDiskDriver(dir);
          }
        }
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
