import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { AVATARS, AvatarId } from '../../src/constants/avatars';
import { PinPad } from '../../src/components/PinPad';
import { TidePoolBackground } from '../../src/components/TidePool';
import { useTheme, type Palette, radii, spacing, typography } from '../../src/theme';

type Profile = {
  id: string;
  type: 'parent' | 'kid';
  display_name: string;
  avatar_id: number;
  pin_hash: string | null;
};

const SHADOW = '#0F766E';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + spacing.lg : 60;

export default function AvatarLockScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const head = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,type,display_name,avatar_id,pin_hash')
        .order('type', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) setError(error.message);
      else setProfiles((data as Profile[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!profiles) return;
    Animated.timing(head, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [profiles, head]);

  function selectProfile(p: Profile) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (p.type === 'parent') {
      router.replace('/(app)/parent' as never);
      return;
    }
    if (p.pin_hash && p.pin_hash.length > 0) {
      setPinError(null);
      setPinTarget(p);
      return;
    }
    router.replace(`/(app)/kid/${p.id}` as never);
  }

  function onPinSubmit(entered: string) {
    if (!pinTarget) return;
    if (entered === pinTarget.pin_hash) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPinTarget(null);
      router.replace(`/(app)/kid/${pinTarget.id}` as never);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setPinError(t('picker.wrongPin'));
    }
  }

  if (error) {
    return (
      <View style={[styles.screen, styles.center]}>
        <TidePoolBackground />
        <Text style={styles.err}>{error}</Text>
      </View>
    );
  }
  if (!profiles) {
    return (
      <View style={[styles.screen, styles.center]}>
        <TidePoolBackground />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const parents = profiles.filter((p) => p.type === 'parent');
  const kids = profiles.filter((p) => p.type === 'kid');
  const cardW = (width - spacing.xl * 2 - spacing.lg) / 2;

  const headStyle = {
    opacity: head,
    transform: [
      { translateY: head.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
    ],
  };

  return (
    <View style={styles.screen}>
      <TidePoolBackground />

      <View style={styles.content}>
        <Animated.View style={headStyle}>
          <Text style={styles.title}>{t('picker.title')}</Text>
          <Text style={styles.subtitle}>{t('picker.subtitle')}</Text>
        </Animated.View>

        {parents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>{t('picker.parents')}</Text>
            <View style={styles.chipRow}>
              {parents.map((p, i) => (
                <Chip key={p.id} profile={p} index={i} onPress={() => selectProfile(p)} />
              ))}
            </View>
          </View>
        )}

        {kids.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>{t('picker.kids')}</Text>
            <View style={styles.grid}>
              {kids.map((p, i) => (
                <Tile
                  key={p.id}
                  profile={p}
                  index={i}
                  width={cardW}
                  onPress={() => selectProfile(p)}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      <Modal
        visible={!!pinTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setPinTarget(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <PinPad
              onSubmit={onPinSubmit}
              onCancel={() => setPinTarget(null)}
              error={pinError ?? undefined}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- parent chip ---------- */

function Chip({
  profile,
  index,
  onPress,
}: {
  profile: Profile;
  index: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const a = AVATARS[profile.avatar_id as AvatarId];
  const { enter, press, onPressIn, onPressOut } = useTileAnim(index);
  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          { scale: press },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.chip}
      >
        <View style={[styles.chipAv, { backgroundColor: a.bg }]}>
          <Text style={styles.chipEmoji}>{a.emoji}</Text>
        </View>
        <Text style={styles.chipName}>{profile.display_name}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- kid tile ---------- */

function Tile({
  profile,
  index,
  width,
  onPress,
}: {
  profile: Profile;
  index: number;
  width: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const a = AVATARS[profile.avatar_id as AvatarId];
  const locked = !!profile.pin_hash && profile.pin_hash.length > 0;
  const { enter, press, bob, onPressIn, onPressOut } = useTileAnim(index, true);

  return (
    <Animated.View
      style={{
        width,
        opacity: enter,
        transform: [
          {
            translateY: Animated.add(
              enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
              bob.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] }),
            ),
          },
          { scale: Animated.multiply(enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }), press) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.card}
      >
        {locked && (
          <View style={styles.lock}>
            <Text style={styles.lockText}>{t('picker.pinBadge')}</Text>
          </View>
        )}
        <View style={[styles.av, { backgroundColor: a.bg }]}>
          <Text style={styles.emoji}>{a.emoji}</Text>
        </View>
        <Text style={styles.name}>{profile.display_name}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- shared tile animation ---------- */

function useTileAnim(index: number, withBob = false) {
  const enter = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 460,
      delay: 120 + index * 75,
      easing: Easing.out(Easing.back(1.3)),
      useNativeDriver: true,
    }).start(() => {
      if (!withBob) return;
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, {
            toValue: 1,
            duration: 2100,
            delay: index * 220,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(bob, {
            toValue: 0,
            duration: 2100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
  }, [enter, bob, index, withBob]);

  function onPressIn() {
    Animated.spring(press, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  }
  function onPressOut() {
    Animated.spring(press, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }

  return { enter, press, bob, onPressIn, onPressOut };
}

/* ---------- styles ---------- */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  err: { color: colors.error, textAlign: 'center', fontFamily: typography.fontFamilySemi, paddingHorizontal: spacing.xl },

  content: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: TOP_INSET },

  title: {
    fontFamily: typography.fontFamilyBold,
    fontSize: 30,
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: typography.fontFamilySemi,
    fontSize: typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs + 2,
  },

  section: { marginTop: spacing.xxl },
  label: {
    fontFamily: typography.fontFamilyBold,
    fontSize: typography.tiny,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },

  // parent chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm - 1,
    paddingLeft: spacing.sm - 1,
    paddingRight: spacing.lg + 2,
    shadowColor: SHADOW,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  chipAv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipEmoji: { fontSize: 20 },
  chipName: { fontFamily: typography.fontFamilyBold, fontSize: typography.body, color: colors.text },

  // kid grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md - 1,
    shadowColor: SHADOW,
    shadowOpacity: 0.13,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  av: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 42 },
  name: { fontFamily: typography.fontFamilyBold, fontSize: typography.h2 - 5, color: colors.text },
  lock: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(15,118,110,0.08)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 1,
    borderRadius: radii.pill,
  },
  lockText: { fontFamily: typography.fontFamilyBold, fontSize: typography.tiny, color: colors.primaryDark },

  // pin modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(6,40,38,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: spacing.sm,
    minWidth: 280,
    shadowColor: SHADOW,
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
});

