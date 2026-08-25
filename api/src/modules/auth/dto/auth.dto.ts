import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@centralia.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'CentralIA@123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
