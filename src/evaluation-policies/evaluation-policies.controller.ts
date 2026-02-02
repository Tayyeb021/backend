import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { EvaluationPoliciesService } from './evaluation-policies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEvaluationPolicyDto, UpdateEvaluationPolicyDto } from './dto/evaluation-policy.dto';

@Controller('evaluation-policies')
@UseGuards(JwtAuthGuard)
export class EvaluationPoliciesController {
  constructor(private evaluationPoliciesService: EvaluationPoliciesService) {}

  @Post()
  async createPolicy(@Request() req: any, @Body() dto: CreateEvaluationPolicyDto) {
    return this.evaluationPoliciesService.createPolicy({
      ...dto,
      clientId: req.user.id,
    });
  }

  @Get()
  async getPolicies(
    @Request() req: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.evaluationPoliciesService.getPolicies(
      req.user.id,
      includeInactive === 'true',
    );
  }

  @Get('default')
  async getDefaultPolicy(@Request() req: any) {
    return this.evaluationPoliciesService.getDefaultPolicy(req.user.id);
  }

  @Get(':id')
  async getPolicyById(@Param('id') id: string) {
    return this.evaluationPoliciesService.getPolicyById(id);
  }

  @Put(':id')
  async updatePolicy(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateEvaluationPolicyDto,
  ) {
    return this.evaluationPoliciesService.updatePolicy(id, dto, req.user.id);
  }

  @Post(':id/calculate')
  async calculateScores(
    @Param('id') id: string,
    @Body() scores: {
      technical: number;
      communication: number;
      problemSolving: number;
      culturalFit: number;
    },
  ) {
    return this.evaluationPoliciesService.calculateScores(id, scores);
  }

  @Patch(':id/lock')
  async lockPolicy(@Param('id') id: string, @Request() req: any) {
    return this.evaluationPoliciesService.lockPolicy(id, req.user.id);
  }

  @Patch(':id/unlock')
  async unlockPolicy(@Param('id') id: string, @Request() req: any) {
    return this.evaluationPoliciesService.unlockPolicy(id, req.user.id);
  }

  @Get(':id/history')
  async getPolicyHistory(@Param('id') id: string, @Request() req: any) {
    return this.evaluationPoliciesService.getPolicyHistory(id, req.user.id);
  }

  @Post(':id/version')
  async createPolicyVersion(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updates: any,
  ) {
    return this.evaluationPoliciesService.createPolicyVersion(id, updates, req.user.id);
  }
}
