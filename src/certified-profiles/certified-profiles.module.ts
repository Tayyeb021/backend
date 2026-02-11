import { Module } from '@nestjs/common';
import { CertifiedProfilesController } from './certified-profiles.controller';
import { CertifiedProfilesService } from './certified-profiles.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';

@Module({
  imports: [PrismaModule, EvidenceModule],
  controllers: [CertifiedProfilesController],
  providers: [CertifiedProfilesService],
  exports: [CertifiedProfilesService],
})
export class CertifiedProfilesModule {}
