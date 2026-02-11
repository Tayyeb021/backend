import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CollaborationService } from './collaboration.service';
import { AddCommentDto } from './dto/add-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('collaboration')
@UseGuards(JwtAuthGuard)
export class CollaborationController {
  constructor(private collaborationService: CollaborationService) {}

  @Post('candidates/:candidateId/comments')
  async addComment(
    @Param('candidateId') candidateId: string,
    @Request() req: any,
    @Body() dto: AddCommentDto,
  ) {
    return this.collaborationService.addComment(
      candidateId,
      req.user.id,
      dto,
    );
  }

  @Get('candidates/:candidateId/comments')
  async getComments(@Param('candidateId') candidateId: string) {
    return this.collaborationService.getComments(candidateId);
  }

  @Post('candidates/:candidateId/share')
  async shareCandidate(
    @Param('candidateId') candidateId: string,
    @Request() req: any,
    @Body() body: { sharedWithUserId: string; notes?: string },
  ) {
    return this.collaborationService.shareCandidate(
      candidateId,
      req.user.id,
      body.sharedWithUserId,
      body.notes,
    );
  }

  @Get('candidates/:candidateId/shares')
  async getShares(@Param('candidateId') candidateId: string) {
    return this.collaborationService.getShares(candidateId);
  }

  @Get('activity')
  async getActivityLogs(
    @Request() req: any,
    @Query('candidateId') candidateId?: string,
  ) {
    return this.collaborationService.getActivityLogs(
      candidateId,
      req.user.id,
    );
  }

  @Get('candidates/:candidateId/activity')
  async getCandidateActivity(@Param('candidateId') candidateId: string) {
    return this.collaborationService.getActivityLogs(candidateId);
  }

  @Get('users/search')
  async searchUsers(@Query('q') query?: string) {
    return this.collaborationService.searchUsers(query || '');
  }
}
