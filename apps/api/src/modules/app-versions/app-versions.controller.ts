import { Controller, Get, Query } from '@nestjs/common';
import { AppVersionsService } from './app-versions.service';
import { CheckAppVersionQueryDto } from './dto';

@Controller('app-versions')
export class AppVersionsController {
  constructor(private readonly service: AppVersionsService) {}

  @Get('check')
  async check(@Query() q: CheckAppVersionQueryDto) {
    return this.service.check(q.platform, q.version);
  }
}
