import { SetMetadata } from '@nestjs/common';

export const TOKEN_ONLY_KEY = 'publicApiTokenOnly';

/**
 * The ONLY opt-out from the scope check (Ruling 13): the route needs a valid access token and no
 * scope. Meant for the connection-level routes (`GET /public/v1/accounts`) and `GET /public/v1/account`. Every other route must carry `@RequireScopes`;
 * a route with neither is refused (`403 insufficient_scope`) — a forgotten decorator never serves data.
 */
export const TokenOnly = () => SetMetadata(TOKEN_ONLY_KEY, true);
