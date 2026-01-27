import { IsString, IsArray, IsOptional, MaxLength, MinLength, IsUUID } from 'class-validator';

export class AddCommentDto {
  @IsString()
  @MinLength(1, { message: 'Comment cannot be empty' })
  @MaxLength(5000, { message: 'Comment cannot exceed 5000 characters' })
  content: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each mentioned user ID must be a valid UUID' })
  mentionedUserIds?: string[];
}
