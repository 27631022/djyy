import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization';
import { UserModule } from '../user';
import { ExternalApiModule } from '../external-api';
import { StorageModule } from '../storage';
import { RoleModule } from '../role';
import { PromptModule } from '../prompt';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskExtractionService } from './task-extraction.service';

@Module({
  imports: [OrganizationModule, UserModule, ExternalApiModule, StorageModule, RoleModule, PromptModule],
  controllers: [TaskController],
  providers: [TaskService, TaskExtractionService],
  exports: [TaskService],
})
export class TaskModule {}
