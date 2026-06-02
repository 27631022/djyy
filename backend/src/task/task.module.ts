import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization';
import { UserModule } from '../user';
import { ExternalApiModule } from '../external-api';
import { TaskTemplateController } from './task-template.controller';
import { TaskTemplateService } from './task-template.service';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskExtractionService } from './task-extraction.service';

@Module({
  imports: [OrganizationModule, UserModule, ExternalApiModule],
  controllers: [TaskTemplateController, TaskController],
  providers: [TaskTemplateService, TaskService, TaskExtractionService],
  exports: [TaskTemplateService, TaskService],
})
export class TaskModule {}
