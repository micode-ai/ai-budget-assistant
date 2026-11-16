import { json, urlencoded, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

/**
 * A body limit for routes reachable BEFORE authentication (ABA-809).
 *
 * The app-wide JSON parser accepts 50 MB because authenticated routes carry base64
 * images and audio. Mounted globally, that let anyone make the API buffer 50 MB
 * (twice, with `rawBody`) on login or a webhook without any credentials. These
 * parsers run first on the listed paths; body-parser marks the request as parsed,
 * so the global ones skip it. `rawBody` is kept, because the webhooks verify their
 * signatures over it.
 */
export const SMALL_BODY_LIMIT_BYTES = 1024 * 1024;

/** Unauthenticated routes, as mounted (prefix match): sign-in and the inbound webhooks. */
export const SMALL_BODY_PATHS = [
  '/api/v1/auth',
  '/webhooks/stripe',
  '/telegram/webhook',
  '/whatsapp/webhook',
  '/slack/events',
  '/slack/interactivity',
];

export function smallBodyLimit(limit = SMALL_BODY_LIMIT_BYTES): RequestHandler {
  const keepRaw = (req: Request, _res: Response, buf: Buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  };
  const parsers = [json({ limit, verify: keepRaw }), urlencoded({ extended: true, limit, verify: keepRaw })];
  return (req: Request, res: Response, next: NextFunction) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      res.status(413).json({ statusCode: 413, message: 'Request body is too large' });
      return;
    }
    const run = (i: number): void => {
      if (i === parsers.length) return next();
      parsers[i](req, res, (err?: unknown) => {
        if (err) return next(err);
        run(i + 1);
      });
    };
    run(0);
  };
}
