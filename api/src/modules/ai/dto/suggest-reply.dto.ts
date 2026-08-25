import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class HistoryItemDto {
  @ApiProperty({ enum: ['CUSTOMER', 'AGENT', 'AI'] })
  @IsIn(['CUSTOMER', 'AGENT', 'AI'])
  sender: 'CUSTOMER' | 'AGENT' | 'AI';

  @ApiProperty()
  @IsString()
  content: string;
}

export class SuggestReplyDto {
  @ApiProperty({ type: [HistoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryItemDto)
  history: HistoryItemDto[];

  @ApiPropertyOptional({ description: 'Contexto adicional do cliente/serviço' })
  @IsOptional()
  @IsString()
  context?: string;
}
