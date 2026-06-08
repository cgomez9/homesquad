// mobile/app/_layout.tsx — full file
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../src/hooks/useAuth';
import { useFamily, refetchFamily } from '../src/hooks/useFamily';
import { useKidSession } from '../src/hooks/useKidSession';
import { decideRoute } from '../src/lib/sessionRouting';
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

// Shown when the family lookup errors out. Mounted only after i18n is ready
// (the loading guard above gates on i18nReady), so useTranslation is safe here.
function AccountLoadError() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
      <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 18, textAlign: 'center' }}>
        {t('app.loadError.title')}
      </Text>
      <Text style={{ fontFamily: 'Nunito_400Regular', fontSize: 14, textAlign: 'center', opacity: 0.7 }}>
        {t('app.loadError.body')}
      </Text>
      <Pressable
        onPress={() => refetchFamily()}
        style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 999, backgroundColor: '#2563eb' }}
      >
        <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 15, color: '#fff' }}>
          {t('app.loadError.retry')}
        </Text>
      </Pressable>
      <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 4, paddingVertical: 10, paddingHorizontal: 20 }}>
        <Text style={{ fontFamily: 'Nunito_600SemiBold', fontSize: 14, color: '#2563eb' }}>
          {t('app.loadError.signOut')}
        </Text>
      </Pressable>
    </View>
  );
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
    const target = decideRoute(auth, kidSession, family, segments as string[]);
    if (target) router.replace(target as never);
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

  // Family lookup failed (e.g. transient network/RLS error). Don't strand the
  // user on whatever screen they happened to be on — offer a recovery path
  // instead of silently treating it as "no family".
  if (auth.status === 'authenticated' && family.status === 'error') {
    return <AccountLoadError />;
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
