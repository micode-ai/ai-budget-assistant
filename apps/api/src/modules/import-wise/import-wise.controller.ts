import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportWiseService } from './import-wise.service';
import { WiseImportCommitDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';

@Controller('import/wise')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ImportWiseController {
  constructor(private readonly service: ImportWiseService) {}

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  preview(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.parsePreview(req.accountId, req.user.id, file.buffer);
  }

  @Post('commit')
  // Viewers may preview but not write (ABA-807).
  @UseGuards(new ViewerBlockGuard())
  commit(@Req() req: AuthenticatedRequest, @Body() dto: WiseImportCommitDto) {
    return this.service.commit(req.accountId, req.user.id, dto);
  }
}
