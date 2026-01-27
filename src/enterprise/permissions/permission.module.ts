import { Module, Global } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';
import { PermissionGuard } from './permission.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PermissionService, PermissionGuard],
  controllers: [PermissionController],
  exports: [PermissionService, PermissionGuard],
})
export class PermissionModule {}
