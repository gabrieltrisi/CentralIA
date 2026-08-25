import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { SuggestReplyDto } from './dto/suggest-reply.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('suggest-reply')
  @ApiOperation({ summary: 'Gerar sugestão de resposta para o atendente' })
  async suggestReply(@Body() dto: SuggestReplyDto) {
    const suggestion = await this.ai.suggestReply(dto);
    return { suggestion };
  }
}
