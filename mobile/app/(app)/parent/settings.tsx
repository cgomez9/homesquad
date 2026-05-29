// mobile/app/(app)/parent/settings.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Switch,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../../src/lib/supabase';
import { Button } from '../../../src/components/Button';
import { signOut } from '../../../src/lib/auth';
import { isEnabled, setEnabled } from '../../../src/lib/feedback';
import { DeleteAccountModal } from '../../../src/components/DeleteAccountModal';
import { useTranslation } from 'react-i18next';
import { LanguagePickerModal } from '../../../src/components/LanguagePickerModal';
import { ThemePickerModal } from '../../../src/components/ThemePickerModal';
import { setLanguage as setI18nLanguage, getCurrentLanguagePref } from '../../../src/i18n';
import { QuietHoursPicker } from '../../../src/components/QuietHoursPicker';
import { PushPrefsList } from '../../../src/components/PushPrefsList';
import { KidDevicesList } from '../../../src/components/KidDevicesList';
import { PairDeviceModal } from '../../../src/components/PairDeviceModal';
import type { EventType } from '../../../src/components/PushPrefsList';
import { AVATARS, AvatarId } from '../../../src/constants/avatars';
import { TidePoolBackground } from '../../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../../src/theme';

const SHADOW = '#0F766E';
const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 56;

export default function Settings() {
  const { colors, mode: themeMode, setMode: setThemeMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedbackOn, setFeedbackOn] = useState(true);

  useEffect(() => {
    isEnabled().then(setFeedbackOn);
  }, []);

  async function onToggleFeedback(v: boolean) {
    setFeedbackOn(v);
    await setEnabled(v);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['family-summary'],
    queryFn: async () => {
      const { data: fam } = await supabase.from('families').select('name').limit(1).maybeSingle();
      const { data: profs } = await supabase.from('profiles').select('id, type, avatar_id');
      const members = (profs ?? []) as { id: string; type: string; avatar_id: number }[];
      return {
        familyName: (fam as { name: string } | null)?.name ?? '',
        memberCount: members.length,
        parentCount: members.filter((m) => m.type === 'parent').length,
        avatars: members.map((m) => m.avatar_id),
      };
    },
  });

  // --- Identity: resolve familyId + profileId for Notifications queries ---
  const { data: identityData } = useQuery({
    queryKey: ['parent-identity'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, family_id')
        .eq('user_id', user.id)
        .eq('type', 'parent')
        .maybeSingle();
      if (!profile) return null;
      return { profileId: profile.id as string, familyId: profile.family_id as string };
    },
  });

  const familyId = identityData?.familyId ?? null;
  const profileId = identityData?.profileId ?? null;

  // --- Quiet Hours query ---
  const { data: familyData } = useQuery({
    queryKey: ['family', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('families')
        .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
        .eq('id', familyId!)
        .single();
      if (error) throw error;
      return data as unknown as {
        quiet_hours_enabled: boolean;
        quiet_hours_start: string;
        quiet_hours_end: string;
        timezone: string;
      };
    },
  });

  // --- Push prefs query ---
  const { data: pushPrefsData } = useQuery({
    queryKey: ['profile-push-prefs', profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('push_prefs')
        .eq('id', profileId!)
        .single();
      if (error) throw error;
      return ((data as unknown as { push_prefs: Record<string, boolean> } | null)?.push_prefs ?? {}) as Partial<Record<EventType, boolean>>;
    },
  });

  // --- set_quiet_hours mutation ---
  const setQuietHours = useMutation({
    mutationFn: async (values: { enabled: boolean; start: string; end: string; timezone: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('set_quiet_hours', {
        p_enabled: values.enabled,
        p_start: values.start,
        p_end: values.end,
        p_timezone: values.timezone,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family', familyId] });
    },
  });

  // --- set_push_pref mutation ---
  const setPushPref = useMutation({
    mutationFn: async ({ event, enabled }: { event: EventType; enabled: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('set_push_pref', {
        p_event_type: event,
        p_enabled: enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-push-prefs', profileId] });
    },
  });

  // --- Kids list query ---
  const { data: kidsData } = useQuery({
    queryKey: ['kids-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_id')
        .eq('type', 'kid')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as { id: string; display_name: string; avatar_id: number }[];
    },
  });

  // --- Kid devices query ---
  const { data: kidDevicesMap, refetch: refetchDevices } = useQuery({
    queryKey: ['kid-devices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kid_devices')
        .select('id, kid_id, device_name, last_seen_at')
        .is('revoked_at', null);
      if (error) throw error;
      const byKid = new Map<string, { id: string; device_name: string; last_seen_at: string }[]>();
      for (const row of (data ?? []) as { id: string; kid_id: string; device_name: string; last_seen_at: string }[]) {
        const arr = byKid.get(row.kid_id) ?? [];
        arr.push({ id: row.id, device_name: row.device_name, last_seen_at: row.last_seen_at });
        byKid.set(row.kid_id, arr);
      }
      return byKid;
    },
  });

  const [pairKidId, setPairKidId] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_family_invite');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (c) => { setCopied(false); setCode(c); },
    onError: (e) => Alert.alert(t('settings.invite.couldNotGenerate'), (e as Error).message),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_account');
      if (error) throw error;
    },
    onSuccess: async () => {
      setDeleteOpen(false);
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    },
    onError: (e) => setDeleteError((e as Error).message),
  });

  const { t } = useTranslation();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [langPref, setLangPref] = useState<'en' | 'es' | 'system'>('system');

  useEffect(() => {
    getCurrentLanguagePref().then(setLangPref);
  }, []);

  async function onSelectLanguage(lang: 'en' | 'es' | 'system') {
    setLangPickerOpen(false);
    await setI18nLanguage(lang);
    setLangPref(lang);
  }

  function currentLanguageLabel(): string {
    if (langPref === 'system') return t('settings.language.system');
    if (langPref === 'es') return t('settings.language.spanish');
    return t('settings.language.english');
  }

  function currentThemeLabel(): string {
    if (themeMode === 'system') return t('settings.theme.system');
    if (themeMode === 'dark') return t('settings.theme.dark');
    return t('settings.theme.light');
  }

  async function onCopy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }

  const clusterAvatars = (data?.avatars ?? []).slice(0, 5);
  const overflow = (data?.memberCount ?? 0) - clusterAvatars.length;

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        {/* family hero */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <View style={styles.cluster}>
                {clusterAvatars.map((id, i) => {
                  const av = AVATARS[id as AvatarId] ?? AVATARS[1];
                  return (
                    <View
                      key={i}
                      style={[
                        styles.clusterAv,
                        { backgroundColor: av.bg, marginLeft: i === 0 ? 0 : -12, zIndex: 5 - i },
                      ]}
                    >
                      <Text style={styles.clusterEmoji}>{av.emoji}</Text>
                    </View>
                  );
                })}
                {overflow > 0 && (
                  <View style={[styles.clusterAv, styles.clusterMore, { marginLeft: -12 }]}>
                    <Text style={styles.clusterMoreText}>+{overflow}</Text>
                  </View>
                )}
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroName} numberOfLines={1}>{data?.familyName || t('settings.familyFallback')}</Text>
                <Text style={styles.heroMeta}>
                  {t('settings.memberCount', { count: data?.memberCount ?? 0 })}
                  {(data?.parentCount ?? 0) > 0 ? ` · ${t('settings.parentCount', { count: data?.parentCount ?? 0 })}` : ''}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* co-parents */}
        <Text style={styles.label}>{t('settings.coParents')}</Text>
        <View style={styles.card}>
          <View style={styles.cardPad}>
            <Button label={t('settings.inviteCoParent')} onPress={() => invite.mutate()} loading={invite.isPending} variant="secondary" />
          </View>
        </View>

        {/* devices — per-kid */}
        {(kidsData ?? []).length > 0 && (
          <>
            <Text style={styles.label}>{t('settings.devices.label', 'Devices')}</Text>
            {(kidsData ?? []).map((kid) => (
              <View key={kid.id} style={{ marginBottom: spacing.md }}>
                <Text style={styles.kidDevicesName}>{kid.display_name}</Text>
                <KidDevicesList
                  kidId={kid.id}
                  devices={kidDevicesMap?.get(kid.id) ?? []}
                  onPair={(id) => setPairKidId(id)}
                  onChanged={() => refetchDevices()}
                />
              </View>
            ))}
          </>
        )}

        {/* feedback */}
        <Text style={styles.label}>{t('settings.feedback')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>{t('settings.soundsHaptics')}</Text>
            <Switch value={feedbackOn} onValueChange={onToggleFeedback} />
          </View>
        </View>

        <View style={styles.stub}>
          <Text style={styles.stubText}>{t('settings.subscriptionSoon')}</Text>
        </View>

        {/* language */}
        <Text style={styles.label}>{t('settings.language.label')}</Text>
        <View style={styles.card}>
          <Pressable onPress={() => setLangPickerOpen(true)} style={styles.row}>
            <Text style={styles.rowKey}>{currentLanguageLabel()}</Text>
            <Text style={styles.changeText}>{t('settings.language.change')}</Text>
          </Pressable>
        </View>

        {/* theme */}
        <Text style={styles.label}>{t('settings.theme.label')}</Text>
        <View style={styles.card}>
          <Pressable onPress={() => setThemePickerOpen(true)} style={styles.row}>
            <Text style={styles.rowKey}>{currentThemeLabel()}</Text>
            <Text style={styles.changeText}>{t('settings.language.change')}</Text>
          </Pressable>
        </View>

        {/* notifications — embeds untouched QuietHoursPicker + PushPrefsList */}
        <Text style={styles.label}>{t('settings.notifications.label', 'Notifications')}</Text>
        <View style={styles.card}>
          <View style={styles.cardPad}>
            {familyData ? (
              <QuietHoursPicker
                enabled={familyData.quiet_hours_enabled}
                start={familyData.quiet_hours_start}
                end={familyData.quiet_hours_end}
                timezone={familyData.timezone}
                onSave={(values) => setQuietHours.mutateAsync(values)}
              />
            ) : null}
            <PushPrefsList
              prefs={pushPrefsData ?? {}}
              onTogglePref={(event, enabled) => setPushPref.mutateAsync({ event, enabled })}
            />
          </View>
        </View>

        {/* more */}
        <Text style={styles.label}>{t('settings.more')}</Text>
        <View style={styles.card}>
          <Pressable onPress={() => router.push('/(app)/parent/leaderboard')} style={styles.linkRow}>
            <Text style={styles.rowKey}>{t('leaderboard.title')}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => router.push('/(app)/parent/goals')} style={styles.linkRow}>
            <Text style={styles.rowKey}>{t('goals.title')}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {/* account */}
        <Text style={styles.label}>{t('settings.account.label')}</Text>
        <Pressable
          onPress={() => { setDeleteError(null); setDeleteOpen(true); }}
          style={[styles.card, styles.dangerCard]}
        >
          <View style={styles.linkRow}>
            <Text style={styles.dangerText}>{t('settings.account.deleteAccount')}</Text>
            <Text style={[styles.chevron, { color: '#F0A6B4' }]}>›</Text>
          </View>
        </Pressable>

        <View style={styles.bottomBtns}>
          <Button label={t('settings.switchProfile')} variant="secondary" onPress={() => router.replace('/(app)')} />
          <Button label={t('settings.signOut')} variant="secondary" onPress={signOut} style={{ marginTop: spacing.sm }} />
        </View>
      </ScrollView>

      <Modal visible={!!code} transparent animationType="fade" onRequestClose={() => setCode(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('settings.invite.codeTitle')}</Text>
            <Text style={styles.codeBig}>{code}</Text>
            <Text style={styles.modalSub}>{t('settings.invite.codeSub')}</Text>
            <Pressable onPress={onCopy} style={styles.copyBtn}>
              <Text style={styles.copyText}>{copied ? t('settings.invite.copied') : t('settings.invite.copy')}</Text>
            </Pressable>
            <Pressable onPress={() => setCode(null)} style={styles.modalDone}>
              <Text style={styles.modalDoneText}>{t('settings.invite.done')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <DeleteAccountModal
        visible={deleteOpen}
        loading={deleteAccount.isPending}
        error={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => { setDeleteError(null); deleteAccount.mutate(); }}
      />

      <LanguagePickerModal
        visible={langPickerOpen}
        current={langPref}
        onSelect={onSelectLanguage}
        onCancel={() => setLangPickerOpen(false)}
      />

      <ThemePickerModal
        visible={themePickerOpen}
        current={themeMode}
        onSelect={async (m) => {
          setThemePickerOpen(false);
          await setThemeMode(m);
        }}
        onCancel={() => setThemePickerOpen(false)}
      />

      {pairKidId && (
        <PairDeviceModal
          visible
          kidId={pairKidId}
          onClose={() => setPairKidId(null)}
          onPaired={(_payload) => { setPairKidId(null); refetchDevices(); }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: TOP_INSET, paddingBottom: spacing.xxl },

  title: { fontFamily: typography.fontFamilyBold, fontSize: 30, color: colors.text, letterSpacing: -0.3, marginBottom: spacing.lg },

  hero: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 88,
    overflow: 'hidden',
    shadowColor: SHADOW,
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  heroGlow: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(14,165,164,0.12)',
  },
  cluster: { flexDirection: 'row' },
  clusterAv: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  clusterEmoji: { fontSize: 21 },
  clusterMore: { backgroundColor: '#E3EAE8' },
  clusterMoreText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.textMuted },
  heroText: { flex: 1, minWidth: 0 },
  heroName: { fontFamily: typography.fontFamilyBold, fontSize: 21, color: colors.text },
  heroMeta: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, marginTop: 2 },

  label: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.tiny,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm + 1,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardPad: { padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    gap: spacing.md,
  },
  rowKey: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text, flex: 1 },
  changeText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: colors.primary },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  chevron: { fontSize: 20, color: '#BBD2CD', fontFamily: typography.fontFamilyBold },
  divider: { height: 1, backgroundColor: '#F1F6F4', marginHorizontal: spacing.lg },

  stub: {
    backgroundColor: 'rgba(15,118,110,0.05)',
    borderRadius: 14,
    paddingVertical: spacing.md + 1,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  stubText: { fontFamily: typography.fontFamilyBold, fontSize: typography.small, color: '#7E938F', textAlign: 'center' },

  dangerCard: { borderWidth: 1.5, borderColor: '#F7C9D2', backgroundColor: '#FFF5F6' },
  dangerText: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.error },

  kidDevicesName: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.body,
    color: colors.text,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },

  bottomBtns: { marginTop: spacing.xl },

  modalBg: { flex: 1, backgroundColor: 'rgba(6,40,38,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    width: 320,
    gap: spacing.md,
    alignItems: 'center',
    shadowColor: SHADOW,
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  modalTitle: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2, color: colors.text },
  codeBig: { fontFamily: typography.fontFamilyBold, fontSize: 36, letterSpacing: 8, color: colors.primaryDark, marginVertical: spacing.sm },
  modalSub: { fontFamily: typography.fontFamilySemi, fontSize: typography.small, color: colors.textMuted, textAlign: 'center' },
  copyBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  copyText: { color: '#fff', fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  modalDone: { paddingVertical: spacing.sm },
  modalDoneText: { fontFamily: typography.fontFamilySemi, fontSize: typography.body, color: colors.textMuted },
  });
