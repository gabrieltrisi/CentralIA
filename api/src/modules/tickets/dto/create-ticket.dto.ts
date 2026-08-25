import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTicketDto {
  @ApiPropertyOptional({ enum: TicketType, default: TicketType.SUPPORT })
  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

  @ApiProperty({ description: 'Resumo/assunto do ticket' })
  @IsString()
  @MinLength(3)
  summary: string;

  @ApiPropertyOptional({ description: 'Id do cliente local (Customer.id)' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Id da conversa (Conversation.id)' })
  @IsOptional()
  @IsString()
  conversationId?: string;
}
