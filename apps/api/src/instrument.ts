import * as Sentry from '@sentry/node';
import { scrubSentryEvent } from './common/sentry/sentry-scrub';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    release: process.env.GIT_SHA,
    // OAuth / public API credentials must never reach Sentry (bodies, auth headers, ?code=).
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendTransaction: (event) => scrubSentryEvent(event),
  });
}
