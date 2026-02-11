import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { RunCodeDto } from './dto/run-code.dto';
import { AssessmentStatus, UserRole } from '@prisma/client';

@Controller('assessments')
@UseGuards(JwtAuthGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post('coding')
  @UseGuards(RolesGuard)
  @Roles(UserRole.admin, UserRole.client, UserRole.recruiter)
  async createAssessment(@Request() req, @Body() createDto: CreateAssessmentDto) {
    return this.assessmentsService.createAssessment(req.user.id, createDto);
  }

  @Get('coding')
  async listAssessments(
    @Request() req,
    @Query('candidateId') candidateId?: string,
    @Query('jobId') jobId?: string,
    @Query('interviewId') interviewId?: string,
    @Query('status') status?: AssessmentStatus,
  ) {
    return this.assessmentsService.listAssessments({
      candidateId,
      jobId,
      interviewId,
      userId: req.user.id,
      userRole: req.user.role,
      status,
    });
  }

  @Get('coding/:id')
  async getAssessment(@Param('id') id: string, @Request() req) {
    return this.assessmentsService.getAssessment(id, req.user.id, req.user.role);
  }

  @Patch('coding/:id/start')
  async startAssessment(@Param('id') id: string, @Request() req) {
    return this.assessmentsService.startAssessment(id, req.user.id, req.user.role);
  }

  @Post('coding/:id/run')
  async runCode(
    @Param('id') id: string,
    @Body() runCodeDto: RunCodeDto,
    @Request() req,
  ): Promise<{
    testResults: Array<{
      name: string;
      input: string;
      expected: string;
      output?: string;
      passed: boolean;
      error?: string;
      executionTime?: string;
    }>;
    passedCount: number;
    totalCount: number;
  }> {
    return this.assessmentsService.runCode(id, runCodeDto, req.user.id, req.user.role);
  }

  @Patch('coding/:id/submit')
  async submitAssessment(@Param('id') id: string, @Body() submitDto: SubmitAssessmentDto, @Request() req) {
    return this.assessmentsService.submitAssessment(id, submitDto, req.user.id, req.user.role);
  }

  @Post('coding/:id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.admin, UserRole.client, UserRole.recruiter)
  async reviewCode(@Param('id') id: string): Promise<{
    codeReview: {
      overallScore: number;
      qualityScore: number;
      efficiencyScore: number;
      readabilityScore: number;
      bestPracticesScore: number;
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
      review: string;
      complexity: 'low' | 'medium' | 'high';
      timeComplexity?: string;
      spaceComplexity?: string;
    };
    assessment: any;
  }> {
    return this.assessmentsService.reviewCode(id);
  }

  @Delete('coding/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.admin, UserRole.client, UserRole.recruiter)
  async deleteAssessment(@Param('id') id: string, @Request() req) {
    return this.assessmentsService.deleteAssessment(id, req.user.id, req.user.role);
  }

}

// Separate controller for public endpoints (no auth guard)
@Controller('assessments/public')
export class PublicAssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get(':token')
  async getAssessmentByToken(@Param('token') token: string) {
    return this.assessmentsService.verifyAccessToken(token);
  }

  @Patch(':token/start')
  async startAssessmentByToken(@Param('token') token: string) {
    return this.assessmentsService.startAssessmentByToken(token);
  }

  @Post(':token/run')
  async runCodeByToken(
    @Param('token') token: string,
    @Body() runCodeDto: RunCodeDto,
  ): Promise<{
    testResults: Array<{
      name: string;
      input: string;
      expected: string;
      output?: string;
      passed: boolean;
      error?: string;
      executionTime?: string;
    }>;
    passedCount: number;
    totalCount: number;
  }> {
    return this.assessmentsService.runCodeByToken(token, runCodeDto);
  }

  @Patch(':token/submit')
  async submitAssessmentByToken(@Param('token') token: string, @Body() submitDto: SubmitAssessmentDto) {
    return this.assessmentsService.submitAssessmentByToken(token, submitDto);
  }
}
