import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { EvaluationBlueprintsService } from './evaluation-blueprints.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('evaluation-blueprints')
@UseGuards(JwtAuthGuard)
export class EvaluationBlueprintsController {
  constructor(private evaluationBlueprintsService: EvaluationBlueprintsService) {}

  @Post()
  async createBlueprint(@Request() req: any, @Body() body: {
    name: string;
    description?: string;
    questionMappings: any;
    skillMappings: any;
    scoringRules: any;
    roleSpecId?: string;
    isDefault?: boolean;
  }) {
    return this.evaluationBlueprintsService.createBlueprint({
      ...body,
      clientId: req.user.id,
    });
  }

  @Get()
  async getBlueprints(
    @Request() req: any,
    @Query('roleSpecId') roleSpecId?: string,
  ) {
    return this.evaluationBlueprintsService.getBlueprints(req.user.id, roleSpecId);
  }

  @Get(':id')
  async getBlueprintById(@Param('id') id: string) {
    return this.evaluationBlueprintsService.getBlueprintById(id);
  }

  @Put(':id')
  async updateBlueprint(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updates: any,
  ) {
    return this.evaluationBlueprintsService.updateBlueprint(id, updates, req.user.id);
  }
}
