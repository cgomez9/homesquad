// mobile/app/(app)/parent/settings.tsx
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, Pressable, Alert, Switch } from 'react-native';
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
import { setLanguage as setI18nLanguage, getCurrentLanguagePref } from '../../../src/i18n';
import { QuietHoursPicker } from '../../../src/components/QuietHoursPicker';
import { PushPrefsList } from '../../../src/components/PushPrefsList';
import type { EventType } from '../../../src/components/PushPrefsList';

export default function Settings() {
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
      const { data: profs } = await supabase.from('profiles').select('id, type');
      return {
        familyName: (fam as { name: string } | null)?.name ?? 'Family',
        memberCount: profs?.length ?? 0,
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

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_family_invite');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (c) => { setCopied(false); setCode(c); },
    onError: (e) => Alert.alert('Could not generate code', (e as Error).message),
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

  async function onCopy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {isLoading ? <ActivityIndicator /> : (
        <View style={styles.section}>
          <Text style={styles.label}>Family</Text>
          <Text style={styles.value}>{data?.familyName} · {data?.memberCount} member{data?.memberCount === 1 ? '' : 's'}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Co-parents</Text>
        <Button label="Invite a co-parent" onPress={() => invite.mutate()} loading={invite.isPending} variant="secondary" />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Feedback</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Sounds & haptics on this device</Text>
          <Switch value={feedbackOn} onValueChange={onToggleFeedback} />
        </View>
      </View>

      <View style={styles.stub}><Text style={styles.stubText}>Subscription — coming soon</Text></View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('settings.language.label')}</Text>
        <View style={styles.languageRow}>
          <Text style={styles.value}>{currentLanguageLabel()}</Text>
          <Pressable onPress={() => setLangPickerOpen(true)}>
            <Text style={styles.languageChange}>{t('settings.language.change')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('settings.notifications.label', 'Notifications')}</Text>
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

      <View style={styles.section}>
        <Text style={styles.label}>{t('settings.account.label')}</Text>
        <Pressable onPress={() => { setDeleteError(null); setDeleteOpen(true); }} style={styles.dangerBtn}>
          <Text style={styles.dangerText}>{t('settings.account.deleteAccount')}</Text>
        </Pressable>
      </View>

      <Button label="Switch profile" variant="secondary" onPress={() => router.replace('/(app)')} />
      <Button label="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: 8 }} />

      <Modal visible={!!code} transparent animationType="fade" onRequestClose={() => setCode(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Co-parent invite code</Text>
            <Text style={styles.codeBig}>{code}</Text>
            <Text style={styles.modalSub}>Expires in 24 hours. Share it with your co-parent — they enter it on the join-family screen when they sign up.</Text>
            <Pressable onPress={onCopy} style={styles.copyBtn}>
              <Text style={styles.copyText}>{copied ? '✓ Copied' : 'Copy code'}</Text>
            </Pressable>
            <Pressable onPress={() => setCode(null)} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 48, backgroundColor: '#fff', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  section: { paddingVertical: 8 },
  label: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' },
  value: { fontSize: 16, marginTop: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleLabel: { fontSize: 15, flex: 1 },
  stub: { padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 },
  stubText: { color: '#6b7280' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 320, gap: 12, alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  codeBig: { fontSize: 36, fontWeight: '700', letterSpacing: 8, color: '#111827', marginVertical: 8 },
  modalSub: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  copyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: '#3b82f6' },
  copyText: { color: '#fff', fontWeight: '600' },
  doneBtn: { paddingVertical: 8 },
  doneText: { color: '#6b7280', fontWeight: '500' },
  dangerBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ef4444', alignItems: 'center', marginTop: 8 },
  dangerText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
  languageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  languageChange: { color: '#3b82f6', fontSize: 14, fontWeight: '600' },
});
