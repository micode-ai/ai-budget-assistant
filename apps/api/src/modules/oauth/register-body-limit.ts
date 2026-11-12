import { json, urlencoded, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

/** Largest request body `POST /oauth/register` accepts. A real RFC 7591 request is well under 2 KB. */
export const DCR_BODY_LIMIT_BYTES = 16 * 1024;

/** The route the limit is mounted on in main.ts (served without the api/v1 prefix). */
export const DCR_REGISTER_PATH = '/oauth/register';

function tooLarge(res: Response): void {
  res.status(413).json({ error: 'invalid_client_metadata', error_description: 'request body is too large' });
}

/**
 * Body parsers for the registration route, mounted in main.ts BEFORE the app-wide parsers (whose
 * JSON limit is 50 MB for base64 uploads). body-parser marks a parsed request, so the global parsers
 * skip it afterwards. A declared Content-Length over the limit is refused before anything is read;
 * a chunked body over it is refused by the parser. Either way the answer is an RFC 7591-shaped 413
 * rather than Express's HTML error page, and nothing reaches the controller.
 *
 * `enabled` is read per request (the MCP flag): while it is false the middleware calls `next()`
 * without touching the request, so the route is fully dark — the flag guard's 404, never a 400/413
 * that would reveal the route exists.
 */
export function registerBodyLimit(enabled: () => boolean = () => true): RequestHandler {
  const keepRaw = (req: Request, _res: Response, buf: Buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  };
  const parsers = [
    json({ limit: DCR_BODY_LIMIT_BYTES, verify: keepRaw }),
    urlencoded({ extended: false, limit: DCR_BODY_LIMIT_BYTES, verify: keepRaw }),
  ];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled()) return next();
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > DCR_BODY_LIMIT_BYTES) return tooLarge(res);
    const run = (i: number): void => {
      if (i === parsers.length) return next();
      parsers[i](req, res, (err?: unknown) => {
        if (err) {
          const status = (err as { status?: number }).status;
          if (status === 413) return tooLarge(res);
          res.status(400).json({ error: 'invalid_client_metadata', error_description: 'the request body could not be parsed' });
          return;
        }
        run(i + 1);
      });
    };
    run(0);
  };
}
