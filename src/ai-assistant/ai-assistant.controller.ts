import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AIAssistantService } from './ai-assistant.service';

@Controller('ai-assistant')
@UseGuards(JwtAuthGuard)
export class AIAssistantController {
  constructor(private aiAssistantService: AIAssistantService) {}

  @Post('chat')
  async chat(
    @Request() req: any,
    @Body()
    body: {
      message: string;
      sessionId?: string;
      context?: any;
    },
  ) {
    const userId = req.user?.id;
    return this.aiAssistantService.chat(
      userId,
      body.message,
      body.sessionId,
      body.context,
    );
  }

  @Get('sessions')
  async getSessions(@Request() req: any) {
    const userId = req.user?.id;
    return this.aiAssistantService.getChatSessions(userId);
  }

  @Get('sessions/:sessionId/messages')
  async getSessionMessages(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = req.user?.id;
    return this.aiAssistantService.getSessionMessages(userId, sessionId);
  }
}
