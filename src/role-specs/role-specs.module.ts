import { Module } from '@nestjs/common';
import { RoleSpecsController } from './role-specs.controller';
import { RoleSpecsService } from './role-specs.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RoleSpecsController],
  providers: [RoleSpecsService],
  exports: [RoleSpecsService],
})
export class RoleSpecsModule {}
