import { PrismaService } from '../../database/prisma.service';
import { PublicApiError } from './public-api-error';
import { isPublicCategory, type PublicCategoryType } from './public-categories.query';
import type { PublicApiRequest } from './public-api.types';

/**
 * Helpers every public WRITE path shares, whatever the resource (expenses, incomes).
 * `public-expense-write.adapter.ts` re-exports the older ones so existing imports keep working.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PublicWriteContext {
  accountId: string;
  userId: string;
  /** `OAuthClient.id` of the calling app. */
  clientDbId: string;
}

/** `Idempotency-Key` must be a UUID; it becomes the row's `clientId`, so it is normalised to lower case. */
export function parseIdempotencyKey(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw new PublicApiError(
      400,
      'validation_failed',
      'The Idempotency-Key header must be a UUID.',
      {
        fields: { 'Idempotency-Key': ['Idempotency-Key must be a UUID'] },
      }
    );
  }
  return value.trim().toLowerCase();
}

/**
 * Every referenced category / tag / project must be a live row of THIS account (category: of the
 * given `categoryType`, default expense). All failures are reported at once, `422 validation_failed` with
 * `details.fields.<field>`. `null` (a clear on PATCH) references nothing and is not checked.
 */
export async function assertReferencesBelongToAccount(
  prisma: PrismaService,
  accountId: string,
  refs: { category_id?: string | null; tag_ids?: string[]; project_id?: string | null },
  opts: { categoryType?: PublicCategoryType } = {}
): Promise<void> {
  const categoryType = opts.categoryType ?? 'expense';
  const tagIds = refs.tag_ids ?? [];
  const [categoryOk, tags, project] = await Promise.all([
    // The same predicate GET /categories lists by (Ruling 19).
    refs.category_id ? isPublicCategory(prisma, accountId, refs.category_id, categoryType) : true,
    tagIds.length > 0
      ? prisma.tag.findMany({
          where: { id: { in: tagIds }, accountId, isDeleted: false },
          select: { id: true },
        })
      : [],
    refs.project_id
      ? prisma.project.findFirst({
          where: { id: refs.project_id, accountId, isDeleted: false },
          select: { id: true },
        })
      : null,
  ]);

  const fields: Record<string, string[]> = {};
  if (!categoryOk) {
    fields.category_id = [`category_id must be one of this account's ${categoryType} categories`];
  }
  const found = new Set(tags.map((t) => t.id));
  const missingTags = tagIds.filter((id) => !found.has(id));
  if (missingTags.length > 0) {
    fields.tag_ids = missingTags.map(
      (id) => `tag_ids contains ${id}, which is not a tag of this account`
    );
  }
  if (refs.project_id && !project) {
    fields.project_id = ["project_id must be one of this account's projects"];
  }
  if (Object.keys(fields).length > 0) {
    throw new PublicApiError(
      422,
      'validation_failed',
      'The request references records that are not in this account.',
      {
        fields,
      }
    );
  }
}

export async function fetchAccountCurrency(
  prisma: PrismaService,
  accountId: string
): Promise<string> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { currencyCode: true },
  });
  if (!account) throw new PublicApiError(404, 'not_found', 'Account not found.');
  return account.currencyCode;
}

export function writeContext(req: PublicApiRequest): PublicWriteContext {
  return { accountId: req.accountId, userId: req.user.id, clientDbId: req.oauth.clientDbId };
}
