import { Global, Module } from '@nestjs/common';
import { UserCustomFieldService } from './user-custom-field.service';
import { UserCustomFieldController } from './user-custom-field.controller';

/** @Global — UserService 可直接注入 UserCustomFieldService 做 customFields 校验 */
@Global()
@Module({
  controllers: [UserCustomFieldController],
  providers: [UserCustomFieldService],
  exports: [UserCustomFieldService],
})
export class UserCustomFieldModule {}
