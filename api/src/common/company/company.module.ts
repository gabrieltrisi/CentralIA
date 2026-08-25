import { Global, Module } from '@nestjs/common';
import { CompanyService } from './company.service';

@Global()
@Module({
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
