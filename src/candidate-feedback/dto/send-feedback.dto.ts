import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { FeedbackDeliveryMethod } from '@prisma/client';

export class SendFeedbackDto {
  @IsArray()
  @IsEnum(FeedbackDeliveryMethod, { each: true })
  @IsOptional()
  deliveryMethod?: FeedbackDeliveryMethod[];
}
