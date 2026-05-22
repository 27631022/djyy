import { Module } from '@nestjs/common';
import { NavCategoryService } from './nav-category.service';
import { NavCategoryController } from './nav-category.controller';

@Module({
  controllers: [NavCategoryController],
  providers: [NavCategoryService],
  exports: [NavCategoryService],
})
export class NavCategoryModule {}
