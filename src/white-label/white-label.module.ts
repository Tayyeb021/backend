import { Module } from '@nestjs/common';
import { WhiteLabelController } from './white-label.controller';
import { WhiteLabelService } from './white-label.service';

@Module({
  controllers: [WhiteLabelController],
  providers: [WhiteLabelService],
  exports: [WhiteLabelService],
})
export class WhiteLabelModule {}
