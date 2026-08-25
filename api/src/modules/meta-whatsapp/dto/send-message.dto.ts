import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'Número do destinatário (formato E.164, ex.: 5511999999999)' })
  @IsString()
  to: string;

  @ApiProperty({ description: 'Texto da mensagem' })
  @IsString()
  @MinLength(1)
  text: string;
}
