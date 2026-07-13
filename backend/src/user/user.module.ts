import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { DirectoryService } from './directory.service';
import { DirectoryController } from './directory.controller';
import { OrganizationModule } from '../organization';

@Module({
  imports: [OrganizationModule], // OrgScopeService:用户列表/写操作 + 通讯录管理的数据范围收敛
  controllers: [UserController, DirectoryController],
  providers: [UserService, DirectoryService],
  exports: [UserService],
})
export class UserModule {}
