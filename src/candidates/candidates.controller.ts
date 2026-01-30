import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  UseGuards,
  Query,
  Request,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { WebhookCandidateDto } from './dto/webhook-candidate.dto';
import { CandidateStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('candidates')
export class CandidatesController {
  constructor(private candidatesService: CandidatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createCandidate(@Body() createCandidateDto: CreateCandidateDto) {
    return this.candidatesService.createCandidate(createCandidateDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getCandidates(
    @Query('jobId') jobId?: string,
    @Query() query?: CandidateQueryDto,
    @Request() req?: any,
  ) {
    // If jobId is provided, use legacy endpoint
    if (jobId && query && !query.search && !query.status && !query.skills) {
      return this.candidatesService.getCandidatesByJob(jobId);
    }
    
    // Otherwise use advanced search with user context
    return this.candidatesService.searchCandidates(query || {}, req?.user);
  }

  @Get('my-status')
  @UseGuards(JwtAuthGuard)
  async getMyApplicationStatus(@Request() req) {
    // Get user's email from JWT
    const userEmail = req.user.email;
    return this.candidatesService.getCandidateStatusByEmail(userEmail);
  }

  @Get(':id')
  async getCandidate(@Param('id') id: string) {
    return this.candidatesService.getCandidate(id);
  }

  @Put(':id')
  async updateCandidate(
    @Param('id') id: string,
    @Body() updateCandidateDto: UpdateCandidateDto,
  ) {
    return this.candidatesService.updateCandidate(id, updateCandidateDto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateCandidateStatus(
    @Param('id') id: string,
    @Body() body: { status: CandidateStatus },
    @Request() req: any,
  ) {
    return this.candidatesService.updateCandidateStatus(id, body.status, req.user.id);
  }

  @Post(':id/resume')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('resume'))
  async uploadResume(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /(pdf|docx|doc|txt)$/ }),
        ],
      }),
    )
    file: {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    return this.candidatesService.uploadResume(id, file);
  }

  @Get(':id/completeness')
  @UseGuards(JwtAuthGuard)
  async getProfileCompleteness(@Param('id') id: string) {
    const score = await this.candidatesService.getProfileCompleteness(id);
    return { candidateId: id, completenessScore: score };
  }

  @Get(':id/duplicates')
  @UseGuards(JwtAuthGuard)
  async findDuplicates(@Param('id') id: string) {
    const candidate = await this.candidatesService.getCandidate(id);
    const duplicates = await this.candidatesService.findDuplicates(candidate.email);
    return {
      candidateId: id,
      email: candidate.email,
      duplicates: duplicates.filter(d => d.id !== id),
    };
  }

  @Post('webhook/enroll')
  async enrollFromWebhook(
    @Body() body: WebhookCandidateDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    return this.candidatesService.enrollFromWebhook(body, secret);
  }

  @Get('public/resume-upload/:token')
  async getResumeUploadPage(@Param('token') token: string) {
    const candidate = await this.candidatesService.verifyResumeUploadToken(token);
    const profileData = candidate.profileData as any;
    const interviewId = profileData?.resumeUploadInterviewId;
    
    return {
      candidateId: candidate.id,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      jobTitle: candidate.job?.title || 'Position',
      interviewId: interviewId,
      hasResume: !!candidate.resumeUrl,
      email: candidate.email,
    };
  }

  @Post('public/upload-resume/:token')
  @UseInterceptors(FileInterceptor('resume'))
  async uploadResumePublic(
    @Param('token') token: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /(pdf|docx|doc|txt)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.candidatesService.uploadResumeByToken(token, file);
  }
}
