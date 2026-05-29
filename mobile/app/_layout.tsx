// mobile/app/_layout.tsx — full file
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../src/hooks/useAuth';
import { useFamily } from '../src/hooks/useFamily';
import { useKidSession } from '../src/hooks/useKidSession';
import { queryClient } from '../src/lib/queryClient';
import { subscribeToFamily } from '../src/lib/realtime';
import { supabase } from '../src/lib/supabase';
import { ConfettiHost } from '../src/components/ConfettiHost';
import { AchievementBanner } from '../src/components/AchievementBanner';
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { initI18n } from '../src/i18n';
import { ThemeProvider, useTheme } from '../src/theme';
import { StatusBar } from 'expo-status-bar';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Status-bar icons follow the active theme: light icons on dark bg, dark icons
// on light bg. Lives inside ThemeProvider so it can read the effective scheme.
function ThemedStatusBar() {
  const { effective } = useTheme();
  return <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />;
}

function RealtimeBridge() {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.session.user.id : undefined;
  const family = useFamily(userId);
  const qc = useQueryClient();
  const channelKey = useRef(Math.random().toString(36).slice(2, 10)).current;

  useEffect(() => {
    if (family.status !== 'has-family') return;
    const channel = subscribeToFamily(family.familyId, qc, channelKey);
    return () => { supabase.removeChannel(channel); };
  }, [family, qc]);

  return null;
}

export default function RootLayout() {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.session.user.id : undefined;
  const family = useFamily(userId);
  const kidSession = useKidSession(userId);
  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    if (auth.status === 'loading') return;
    if (auth.status === 'authenticated' && (kidSession.status === 'loading' || family.status === 'loading')) return;

    const inAuthGroup       = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';
    const inPairGroup       = (segments[0] as string) === '(pair)';
    const inAppGroup        = segments[0] === '(app)';

    // Unauthenticated → login (existing behavior).
    if (auth.status === 'unauthenticated') {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Kid session → land on kid mode for the bound kid.
    if (kidSession.status === 'kid') {
      if (!inAppGroup) router.replace(`/(app)/kid/${kidSession.kidId}` as never);
      return;
    }

    // Authenticated anon with no kid_device row → pair screen.
    if (kidSession.status === 'not-kid' && family.status === 'no-family') {
      const isAnon = !!(auth.status === 'authenticated' && auth.session.user.is_anonymous);
      if (isAnon) {
        if (!inPairGroup) router.replace('/(pair)' as never);
        return;
      }
      if (!inOnboardingGroup) router.replace('/(onboarding)/welcome');
      return;
    }

    // Parent with family in auth group → bounce to app (existing behavior).
    if (family.status === 'has-family' && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [auth, kidSession, family, segments]);

  if (
    auth.status === 'loading' ||
    (auth.status === 'authenticated' && (kidSession.status === 'loading' || family.status === 'loading')) ||
    !fontsLoaded ||
    !i18nReady
  ) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <QueryClientProvider client={queryClient}>
        <RealtimeBridge />
        <Slot />
        <ConfettiHost />
        <AchievementBanner />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
