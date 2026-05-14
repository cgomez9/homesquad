// mobile/app/(app)/parent/goals/index.tsx
import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import i18n from '../../../../src/i18n';
import { useActiveGoal } from '../../../../src/hooks/useActiveGoal';
import { GoalCard } from '../../../../src/components/GoalCard';
import { supabase } from '../../../../src/lib/supabase';
import { colors, spacing, radii, typography } from '../../../../src/theme';

type ArchivedGoal = {
  id: string;
  title: string;
  target_stars: number;
  status: 'completed' | 'canceled';
  completed_at: string | null;
  created_at: string;
};

export default function GoalsScreen() {
  // Resolve familyId from the logged-in parent profile
  const { data: familyId } = useQuery({
    queryKey: ['parent-family-id-goals'],
    queryFn: async (): Promise<string | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('user_id', user.id)
        .eq('type', 'parent')
        .maybeSingle();
      return (profile as { family_id: string } | null)?.family_id ?? null;
    },
  });

  const active = useActiveGoal(familyId ?? undefined);

  const archive = useQuery({
    queryKey: ['goals-archive', familyId],
    enabled: !!familyId,
    queryFn: async (): Promise<ArchivedGoal[]> => {
      const { data, error } = await (supabase as any)
        .from('family_goals')
        .select('id, title, target_stars, status, completed_at, created_at')
        .eq('family_id', familyId)
        .in('status', ['completed', 'canceled'])
        .order('completed_at', { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const cancelGoal = async () => {
    if (!active.data) return;
    Alert.alert(
      i18n.t('goals.cancelButton'),
      i18n.t('goals.cancelConfirm'),
      [
        { text: i18n.t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: i18n.t('goals.cancelButton'),
          style: 'destructive',
          onPress: async () => {
            await (supabase as any).rpc('cancel_family_goal', { p_goal_id: active.data!.id });
            active.refetch();
            archive.refetch();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{i18n.t('goals.title')}</Text>

      {active.data ? (
        <View style={styles.activeSection}>
          <GoalCard goal={active.data} />
          <Pressable onPress={cancelGoal} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{i18n.t('goals.cancelButton')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptySection}>
          <Text style={styles.empty}>{i18n.t('goals.noActive')}</Text>
          <Pressable
            onPress={() => router.push('/(app)/parent/goals/create')}
            style={styles.createBtn}
          >
            <Text style={styles.createText}>{i18n.t('goals.createButton')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.archiveTitle}>{i18n.t('goals.archiveTitle')}</Text>
      <FlatList
        data={archive.data ?? []}
        keyExtractor={(g) => g.id}
        ListEmptyComponent={<Text style={styles.empty}>{i18n.t('goals.archiveEmpty')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.archiveRow}>
            <Text style={styles.archiveItemTitle}>{item.title}</Text>
            <Text style={styles.archiveItemMeta}>
              {item.status} · {item.target_stars}⭐
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title:            { fontSize: typography.h1, fontFamily: typography.fontFamilyBold,
                      color: colors.text, marginBottom: spacing.md },
  activeSection:    { marginBottom: spacing.md },
  emptySection:     { marginBottom: spacing.md },
  empty:            { fontSize: typography.body, color: colors.textMuted, fontFamily: typography.fontFamily,
                      padding: spacing.lg, textAlign: 'center' },
  createBtn:        { backgroundColor: colors.primary, borderRadius: radii.pill,
                      paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  createText:       { color: colors.surface, fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  cancelBtn:        { padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  cancelText:       { color: colors.error, fontFamily: typography.fontFamilyBold, fontSize: typography.body },
  archiveTitle:     { fontSize: typography.h2, fontFamily: typography.fontFamilyBold, color: colors.text,
                      marginTop: spacing.xl, marginBottom: spacing.md },
  archiveRow:       { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radii.md,
                      marginBottom: spacing.sm },
  archiveItemTitle: { fontSize: typography.body, fontFamily: typography.fontFamilyBold, color: colors.text },
  archiveItemMeta:  { fontSize: typography.small, color: colors.textMuted, fontFamily: typography.fontFamily },
});
