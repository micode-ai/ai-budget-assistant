import { Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TelegramBotService } from './telegram-bot.service';

@Controller('telegram')
export class TelegramBotController {
  constructor(private readonly botService: TelegramBotService) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.botService.handleUpdate(req.body);
    res.sendStatus(200);
  }
}
