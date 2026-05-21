// Custom Tide Pool tab bar for the parent section. Visual-only — navigation
// behaviour is the standard React Navigation tabPress pattern. The visible
// tab set is fixed (leaderboard/goals are href:null in parent/_layout.tsx and
// intentionally absent here).
import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { spacing, typography, useTheme, type Palette } from '../theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; labelKey: string; on: IoniconName; off: IoniconName }[] = [
  { name: 'index',     labelKey: 'tabs.chores',    on: 'clipboard',              off: 'clipboard-outline' },
  { name: 'rewards',   labelKey: 'tabs.rewards',   on: 'gift',                   off: 'gift-outline' },
  { name: 'approvals', labelKey: 'tabs.approvals', on: 'checkmark-done-circle',  off: 'checkmark-done-circle-outline' },
  { name: 'activity',  labelKey: 'tabs.activity',  on: 'stats-chart',            off: 'stats-chart-outline' },
  { name: 'settings',  labelKey: 'tabs.settings',  on: 'settings',               off: 'settings-outline' },
];

const BOTTOM = Platform.OS === 'ios' ? 22 : 10;

export function ParentTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.bar, { paddingBottom: BOTTOM }]}>
      {TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const focused = activeName === tab.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={tab.name}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(tab.labelKey)}
            style={styles.tab}
          >
            <Ionicons
              name={focused ? tab.on : tab.off}
              size={23}
              color={focused ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.sm + 2,
      shadowColor: '#0F766E',
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -6 },
      elevation: 12,
    },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
    label: {
      fontFamily: typography.fontFamilyBold,
      fontSize: typography.tiny,
      color: colors.textMuted,
    },
    labelOn: { color: colors.primary },
  });
