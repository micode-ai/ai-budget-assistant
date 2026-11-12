import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { McpEnabledGuard } from '../oauth/guards/mcp-enabled.guard';
import { PublicApiModule } from '../public-api/public-api.module';
import { McpController } from './mcp.controller';

/**
 * The MCP connector endpoint (`/mcp`): read-only tools over the public API's query functions and
 * mappers (public-read.views.ts), authorized by PublicApiModule's PublicApiAuthorizer — never a second
 * authorization path. BudgetsModule supplies the BudgetsService the budget reads go through;
 * PublicApiModule exports the ONE PublicAnalyticsService (do not provide a second one here).
 * Design: docs/superpowers/specs/2026-11-12-mcp-connector-design.md.
 */
@Module({
  imports: [PublicApiModule, BudgetsModule],
  controllers: [McpController],
  providers: [McpEnabledGuard],
})
export class McpModule {}
