import { applyDecorators, UseGuards } from '@nestjs/common';
import { ViewerBlockGuard } from '../../accounts/guards/account-role.guard';
import { TripArchivedGuard } from '../../accounts/guards/trip-archived.guard';
import { PublicWriteGuard } from '../guards/public-write.guard';

/**
 * Every mutating `/public/v1` route: encrypted accounts are read-only (`account_encrypted`), then the
 * app's own write guards unchanged — viewers (`viewer_read_only`) and archived trips (`trip_archived`).
 * Put it on the handler; the class-level `PublicApiAuthGuard` has already run.
 */
export const PublicWrite = () => applyDecorators(UseGuards(PublicWriteGuard, new ViewerBlockGuard(), TripArchivedGuard));
