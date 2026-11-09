import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailUnsubscribeController } from './mail-unsubscribe.controller';

@Global()
@Module({
  controllers: [MailUnsubscribeController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
