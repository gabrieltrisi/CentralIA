import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// ===================== Query DTOs =====================

export class ListCustomersQueryDto {
  @ApiPropertyOptional({ description: 'Busca textual (nome/documento)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class ListChargesQueryDto {
  @ApiPropertyOptional({
    description: 'Status da cobrança',
    enum: ['aberta', 'paga', 'vencida', 'cancelada'],
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class ListWorkOrdersQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por cliente (ISPBOX id)' })
  @IsOptional()
  @IsString()
  clientesId?: string;

  @ApiPropertyOptional({ description: 'Status da OS' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

// ===================== Body DTOs =====================

export class TemporaryUnblockDto {
  @ApiPropertyOptional({ description: 'Dias de desbloqueio temporário', default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dias?: number;

  @ApiPropertyOptional({ description: 'Observação/motivo' })
  @IsOptional()
  @IsString()
  observacao?: string;
}

export class CreateWorkOrderDto {
  @ApiProperty({ description: 'Id do cliente na ISPBOX' })
  @IsString()
  clientesId: string;

  @ApiPropertyOptional({ description: 'Id do serviço na ISPBOX' })
  @IsOptional()
  @IsString()
  servicosId?: string;

  @ApiProperty({ description: 'Id do tipo de OS (ver /ordens-servicos/tipos)' })
  @IsString()
  tipoId: string;

  @ApiProperty({ description: 'Assunto / descrição' })
  @IsString()
  @MinLength(3)
  assunto: string;

  @ApiPropertyOptional({ description: 'Detalhamento' })
  @IsOptional()
  @IsString()
  descricao?: string;
}

export class AddWorkOrderNoteDto {
  @ApiProperty({ description: 'Texto da anotação' })
  @IsString()
  @MinLength(1)
  anotacao: string;
}

// ===================== Response shapes (parciais) =====================
// Tipagens leves para autocompletar nas camadas de domínio. A ISPBOX pode
// retornar mais campos; mantemos o índice livre via [key: string].

export interface IspboxCustomer {
  id: string;
  nome?: string;
  cpf_cnpj?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  [key: string]: unknown;
}

export interface IspboxService {
  id: string;
  tipo?: string;
  status?: string;
  [key: string]: unknown;
}

export interface IspboxInternetStatus {
  online?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface IspboxCharge {
  id: string;
  valor?: number;
  status?: string;
  vencimento?: string;
  [key: string]: unknown;
}

export interface IspboxPixQrCode {
  qrcode?: string;
  copia_cola?: string;
  imagem?: string;
  [key: string]: unknown;
}

export interface IspboxWorkOrder {
  id: string;
  status?: string;
  [key: string]: unknown;
}
