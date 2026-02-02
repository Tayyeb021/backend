import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkillTaxonomyService } from './skill-taxonomy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('skill-taxonomy')
@UseGuards(JwtAuthGuard)
export class SkillTaxonomyController {
  constructor(private skillTaxonomyService: SkillTaxonomyService) {}

  @Post('normalize')
  async normalizeSkills(@Body() body: { skills: string[] }) {
    return this.skillTaxonomyService.normalizeSkills(body.skills);
  }

  @Post('upsert')
  async upsertSkill(@Body() body: {
    preferredLabel: string;
    aliases?: string[];
    category: string;
    description?: string;
  }) {
    return this.skillTaxonomyService.upsertSkill(body);
  }

  @Get('category/:category')
  async getSkillsByCategory(@Param('category') category: string) {
    return this.skillTaxonomyService.getSkillsByCategory(category);
  }

  @Get('search')
  async searchSkills(@Query('q') query: string) {
    return this.skillTaxonomyService.searchSkills(query);
  }

  @Get('categories')
  async getCategories() {
    return this.skillTaxonomyService.getCategories();
  }

  @Post('parse-job-description')
  async parseJobDescription(@Body() body: { jobDescription: string }) {
    return this.skillTaxonomyService.parseJobDescription(body.jobDescription);
  }

  @Post('suggest-similar')
  async suggestSimilarSkills(
    @Body() body: { skillName: string; limit?: number },
  ) {
    return this.skillTaxonomyService.suggestSimilarSkills(body.skillName, body.limit);
  }

  @Post('auto-match')
  async autoMatchSkills(@Body() body: { skills: string[] }) {
    return this.skillTaxonomyService.autoMatchSkills(body.skills);
  }

  @Get('role-category/:category')
  async getSkillsByRoleCategory(@Param('category') category: string) {
    return this.skillTaxonomyService.getSkillsByRoleCategory(category);
  }
}
