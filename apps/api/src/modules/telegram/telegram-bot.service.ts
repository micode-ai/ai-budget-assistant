import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from '../ai/services/chat.service';
import { WhisperService } from '../ai/services/whisper.service';
import { OcrService } from '../ai/services/ocr.service';
import { ExpensesService } from '../expenses/expenses.service';
import { IncomesService } from '../incomes/incomes.service';
import { CategoriesService } from '../categories/categories.service';
import { TelegramLinkService } from './telegram-link.service';
import { CommandHandler } from './handlers/command.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { ChatHandler } from './handlers/chat.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { PhotoHandler } from './handlers/photo.handler';
import { CategoryHandler } from './handlers/category.handler';
import { BotContext } from './types';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf<BotContext> | null = null;
  private botUsername: string = '';

  // Handlers
  private commandHandler!: CommandHandler;
  private expenseHandler!: ExpenseHandler;
  private incomeHandler!: IncomeHandler;
  private chatHandler!: ChatHandler;
  private voiceHandler!: VoiceHandler;
  private photoHandler!: PhotoHandler;
  private categoryHandler!: CategoryHandler;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly linkService: TelegramLinkService,
    private readonly chatService: ChatService,
    private readonly whisperService: WhisperService,
    private readonly ocrService: OcrService,
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async onModuleInit(): Promise<void> {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      this.logger.warn('Telegram bot token not configured — bot will not start');
      return;
    }

    try {
      this.bot = new Telegraf<BotContext>(botToken);

      // Initialize handlers
      this.commandHandler = new CommandHandler(this.linkService, this.prisma);
      this.expenseHandler = new ExpenseHandler(this.expensesService);
      this.incomeHandler = new IncomeHandler(this.incomesService);
      this.chatHandler = new ChatHandler(this.chatService, this.linkService, this.prisma);
      this.voiceHandler = new VoiceHandler(this.whisperService, this.chatHandler);
      this.photoHandler = new PhotoHandler(this.ocrService, this.expensesService);
      this.categoryHandler = new CategoryHandler(this.categoriesService);

      // Get bot info
      const botInfo = await this.bot.telegram.getMe();
      this.botUsername = botInfo.username || '';
      this.logger.log(`Bot username: @${this.botUsername}`);

      // Register middleware and handlers
      this.registerMiddleware();
      this.registerHandlers();

      // Start bot
      const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
      if (webhookUrl) {
        const fullUrl = `${webhookUrl}/telegram/webhook`;
        await this.bot.telegram.setWebhook(fullUrl);
        this.logger.log(`Telegram webhook set to ${fullUrl}`);
      } else {
        // Long polling mode for development
        this.bot.launch().catch((err) => {
          this.logger.error(`Failed to launch bot: ${err}`);
        });
        this.logger.log('Telegram bot started in long-polling mode');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize Telegram bot: ${error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
      if (!webhookUrl) {
        this.bot.stop('Module destroy');
      }
    }
  }

  getBotUsername(): string {
    return this.botUsername;
  }

  async handleUpdate(body: unknown): Promise<void> {
    if (!this.bot) return;
    await this.bot.handleUpdate(body as Parameters<typeof this.bot.handleUpdate>[0]);
  }

  private registerMiddleware(): void {
    if (!this.bot) return;

    // Resolve user middleware — runs before every handler
    this.bot.use(async (ctx, next) => {
      const telegramUserId = ctx.from?.id ? String(ctx.from.id) : null;

      if (telegramUserId) {
        const link = await this.linkService.getLink(telegramUserId);
        if (link) {
          ctx.userState = {
            userId: link.userId,
            accountId: link.defaultAccountId,
            conversationId: link.conversationId,
            currencyCode: link.user.currencyCode,
            language: link.user.language || 'en',
            telegramUserId,
          };
        }
      }

      return next();
    });
  }

  private registerHandlers(): void {
    if (!this.bot) return;

    // Commands (these work without authentication for /start, /link, /help)
    this.bot.command('start', (ctx) => this.commandHandler.handleStart(ctx));
    this.bot.command('link', (ctx) => this.commandHandler.handleLink(ctx));
    this.bot.command('help', (ctx) => this.commandHandler.handleHelp(ctx));

    // Commands that require authentication
    this.bot.command('unlink', (ctx) => this.commandHandler.handleUnlink(ctx));
    this.bot.command('expense', (ctx) => this.expenseHandler.handle(ctx));
    this.bot.command('income', (ctx) => this.incomeHandler.handle(ctx));
    this.bot.command('account', (ctx) => this.commandHandler.handleAccount(ctx));
    this.bot.command('newchat', (ctx) => this.commandHandler.handleNewChat(ctx));
    this.bot.command('category', (ctx) => this.categoryHandler.handle(ctx));
    this.bot.command('categories', (ctx) => this.categoryHandler.handleList(ctx));

    // Callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (ctx) => {
      if (!('data' in ctx.callbackQuery)) return;

      const data = ctx.callbackQuery.data;

      // Account switch callback
      if (data.startsWith('account:')) {
        const accountId = data.slice('account:'.length);
        await this.commandHandler.handleAccountCallback(ctx, accountId);
        return;
      }

      // AI chat confirm/reject callbacks (short IDs: "ca:<id>" / "ra:<id>")
      if (data.startsWith('ca:')) {
        const shortId = data.slice('ca:'.length);
        await this.chatHandler.handleConfirmCallback(ctx, shortId);
        return;
      }

      if (data.startsWith('ra:')) {
        const shortId = data.slice('ra:'.length);
        await this.chatHandler.handleRejectCallback(ctx, shortId);
        return;
      }

      // Category type picker callbacks
      if (data.startsWith('cat_e:')) {
        const name = data.slice('cat_e:'.length);
        await this.categoryHandler.handleTypeCallback(ctx, 'expense', name);
        return;
      }

      if (data.startsWith('cat_i:')) {
        const name = data.slice('cat_i:'.length);
        await this.categoryHandler.handleTypeCallback(ctx, 'income', name);
        return;
      }

      // Category delete callbacks
      if (data.startsWith('cat_d:')) {
        const categoryId = data.slice('cat_d:'.length);
        await this.categoryHandler.handleDeleteCallback(ctx, categoryId);
        return;
      }

      // Receipt add/cancel callbacks
      if (data.startsWith('receipt_add:')) {
        const receiptId = data.slice('receipt_add:'.length);
        await this.photoHandler.handleReceiptAddCallback(ctx, receiptId);
        return;
      }

      if (data.startsWith('receipt_cancel:')) {
        const receiptId = data.slice('receipt_cancel:'.length);
        await this.photoHandler.handleReceiptCancelCallback(ctx, receiptId);
        return;
      }
    });

    // Voice messages
    this.bot.on('voice', (ctx) => this.voiceHandler.handle(ctx));
    this.bot.on('audio', (ctx) => this.voiceHandler.handle(ctx));

    // Photos (receipt scanning)
    this.bot.on('photo', (ctx) => this.photoHandler.handlePhoto(ctx));

    // Documents (PDF receipts, image files)
    this.bot.on('document', (ctx) => this.photoHandler.handleDocument(ctx));

    // Free-form text messages (catch-all — must be registered last)
    this.bot.on('text', (ctx) => this.chatHandler.handleText(ctx));
  }
}
