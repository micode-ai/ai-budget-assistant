import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountType, AccountRole, Account } from '@budget/shared-types';
import { SettingsScreenScroll } from '../SettingsScreenScroll';
import { useSettingsPane } from '../SettingsPaneContext';

type IconName = keyof typeof Ionicons.glyphMap;

const ACCOUNT_TYPE_ICONS: Record<AccountType, IconName> = {
  personal: 'person-outline',
  business: 'briefcase-outline',
  shared: 'people-outline',
  investment: 'trending-up-outline',
  trip: 'briefcase-outline',
};

type AccountWithRole = Account & { myRole: AccountRole };

interface AccountCardProps {
  item: AccountWithRole;
  isActive: boolean;
  isArchived?: boolean;
  onDelete: (id: string, name: string) => void;
}

function AccountCard({ item, isActive, isArchived, onDelete }: AccountCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const ROLE_COLORS: Record<AccountRole, string> = {
    owner: theme.colors.primary,
    editor: theme.colors.secondary,
    viewer: theme.colors.textTertiary,
  };

  return (
    <TouchableOpacity
      style={[
        styles.accountCard,
        isActive && styles.accountCardActive,
        isArchived && styles.accountCardArchived,
      ]}
      onPress={() => router.push(`/account/${item.id}`)}
    >
      <View style={[styles.accountIcon, isArchived && styles.accountIconArchived]}>
        <Ionicons
          name={ACCOUNT_TYPE_ICONS[item.type]}
          size={24}
          color={isArchived
            ? theme.colors.textTertiary
            : isActive
              ? theme.colors.primary
              : theme.colors.textSecondary}
        />
      </View>
      <View style={styles.accountInfo}>
        <Text style={[styles.accountName, isArchived && styles.accountNameArchived]}>
          {item.name}
        </Text>
        <View style={styles.accountMeta}>
          <Text style={styles.accountType}>
            {t(`accounts.types.${item.type}`)}
          </Text>
          {isArchived && (
            <View style={styles.archivedBadge}>
              <Text style={styles.archivedBadgeText}>{t('accounts.archived')}</Text>
            </View>
          )}
          {!isArchived && (
            <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[item.myRole] + '20' }]}>
              <Text style={[styles.roleText, { color: ROLE_COLORS[item.myRole] }]}>
                {t(`accounts.roles.${item.myRole}`)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        {isActive && (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={theme.colors.primary}
            style={{ marginRight: theme.spacing[2] }}
          />
        )}
        {item.myRole === 'owner' && !isArchived && (
          <TouchableOpacity onPress={() => onDelete(item.id, item.name)}>
            <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * The account list's body: every account this user belongs to, plus the
 * footer's Create/Join affordances.
 *
 * Lifted out of `app/account/list.tsx` — the third and last of wave 4's
 * extractions, and the pure move of the three: no keying wrinkle, no modal,
 * no `<Stack.Screen>` of its own. The one mechanical difference most
 * extractions make is here too: the outer `SafeAreaView` is gone
 * (`SettingsScreenFrame` supplies it full-page) and the root `ScrollView` is
 * `SettingsScreenScroll` (a plain `View` in a pane, since the shell owns the
 * page scroll).
 *
 * **The one judgement call, and it repeats `BotsSettings.tsx`'s exactly.**
 * This screen's `SafeAreaView` was `edges={['bottom']}`, where `tags/manage`
 * and `projects/index` — the two extracted immediately before it — were both
 * `edges={[]}`, so `SettingsScreenFrame`'s `edges={[]}` would have quietly
 * dropped the system bottom inset from a screen whose last control is a
 * button. It is composed back in from `useSettingsPane().bottomInset` — the
 * sanctioned route, per `SettingsScreenScroll` — which keeps the Join button
 * the same distance clear of the navigation bar on a phone, and adds nothing
 * in a pane, where the shell has already accounted for it. `styles.list`
 * deliberately carries no `paddingBottom` of its own — it is composed at the
 * call site instead, for the same reason `BotsSettings.tsx` moved it: a style
 * array's last entry wins, and two sources for one padding is how one of them
 * silently stops mattering.
 *
 * **`<Stack.Screen>` is not moved here because there never was one to move.**
 * Unlike `tags/manage.tsx`/`projects/index.tsx`, which each carried their own
 * `<Stack.Screen options={{ title }} />` as a sibling of `SettingsRoute`,
 * `account/list`'s title has only ever come from its registration in
 * `app/_layout.tsx` — so the route file needs no sibling element, just the
 * `headerShown: settingsHeaderShown(...)` flip every promoted pane gets there.
 *
 * **No `[currentAccountId]` keying, unlike `TagsSettings.tsx`/
 * `ProjectsSettings.tsx`.** This screen has no mount effect at all — it reads
 * `accounts` straight from `accountStore`, the same live subscription the
 * account switcher already holds, so there is nothing to re-fetch on a switch
 * and nothing this pane could show for the wrong account. Adding a key by
 * analogy with its two siblings would discard state and re-fetch to get a
 * byte-identical answer.
 *
 * **`width: 'form'` is the fix for this task's visible defect, not a style
 * change to the buttons themselves.** The footer's Create/Join buttons have no
 * `flex: 1`, but a `View` column's default `alignItems: 'stretch'` does the
 * same job — each stretches to fill its container's width. At `'full'` pane
 * width that is two ~900px dashed bars, the appearance-chips defect in another
 * costume. The `'form'` cap on `SETTINGS_ENTRIES`'s `accounts` entry caps the
 * container at 720px instead, so no button style needed to change.
 *
 * The three outbound pushes are untouched: `/account/[id]`, `/account/create`
 * and `/account/join` are none of them extracted, moved or dialog-hosted.
 * `account/create`'s own trip card pushes `/trip/new`, which finishes with
 * `router.dismissAll()` — a route can unwind that way, an RN `Modal` cannot.
 */
export function AccountsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { bottomInset } = useSettingsPane();
  const { accounts, currentAccountId, deleteAccount } = useAccountStore();

  const activeAccounts = accounts.filter(
    (a) => !(a.type === 'trip' && a.tripStatus === 'archived'),
  );
  const archivedTrips = accounts.filter(
    (a) => a.type === 'trip' && a.tripStatus === 'archived',
  );

  const handleDelete = (id: string, name: string) => {
    showAlert(
      t('accounts.deleteConfirm'),
      t('accounts.deleteConfirmMessage', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(id);
            } catch (e) {
              showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  return (
    <SettingsScreenScroll
      contentContainerStyle={[styles.list, { paddingBottom: theme.spacing[4] + bottomInset }]}
    >

      {/* Active accounts */}
      {activeAccounts.map((item) => (
        <AccountCard
          key={item.id}
          item={item}
          isActive={item.id === currentAccountId}
          onDelete={handleDelete}
        />
      ))}

      {/* Archived trip accounts */}
      {archivedTrips.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('accounts.archivedTrips')}</Text>
          </View>
          {archivedTrips.map((item) => (
            <AccountCard
              key={item.id}
              item={item}
              isActive={false}
              isArchived
              onDelete={handleDelete}
            />
          ))}
        </>
      )}

      {/* Footer buttons */}
      <View style={styles.footerButtons}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/account/create')}
        >
          <Ionicons name="add-circle-outline" size={24} color={styles.createButtonText.color} />
          <Text style={styles.createButtonText}>{t('accounts.create')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => router.push('/account/join')}
        >
          <Ionicons name="enter-outline" size={24} color={styles.joinButtonText.color} />
          <Text style={styles.joinButtonText}>{t('accounts.joinAccount')}</Text>
        </TouchableOpacity>
      </View>

    </SettingsScreenScroll>
  );
}

const createStyles = (theme: Theme) => ({
  // `paddingBottom` is composed at the call site from the system inset, so it
  // is deliberately not set here — a style array's last entry wins, and two
  // sources for one padding is how one of them silently stops mattering.
  list: {
    padding: theme.spacing[4],
  },
  sectionHeader: {
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  sectionTitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  accountCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    ...theme.shadows.sm,
  },
  accountCardActive: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  accountCardArchived: {
    opacity: 0.6,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.background,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[3],
  },
  accountIconArchived: {
    backgroundColor: theme.colors.background,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  accountNameArchived: {
    color: theme.colors.textSecondary,
  },
  accountMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing[1],
    gap: theme.spacing[2],
  },
  accountType: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  roleBadge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.spacing[2.5],
  },
  roleText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  archivedBadge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.spacing[2.5],
    backgroundColor: theme.colors.textTertiary + '20',
  },
  archivedBadgeText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
    color: theme.colors.textTertiary,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  footerButtons: {
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  createButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed' as const,
    gap: theme.spacing[2],
  },
  createButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.primary,
  },
  joinButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    borderStyle: 'dashed' as const,
    gap: theme.spacing[2],
  },
  joinButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.secondary,
  },
});
