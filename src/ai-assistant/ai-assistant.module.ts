import { Module } from '@nestjs/common';
import { AIAssistantController } from './ai-assistant.controller';
import { AIAssistantService } from './ai-assistant.service';

@Module({
  controllers: [AIAssistantController],
  providers: [AIAssistantService],
  exports: [AIAssistantService],
})
export class AIAssistantModule {}
