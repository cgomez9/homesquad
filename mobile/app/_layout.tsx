import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../src/hooks/useAuth';
import { useFamily } from '../src/hooks/useFamily';
import { queryClient } from '../src/lib/queryClient';

export default function RootLayout() {
  const auth = useAuth();
  const userId = auth.status === 'authenticated' ? auth.session.user.id : undefined;
  const family = useFamily(userId);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (auth.status === 'loading') return;
    if (auth.status === 'authenticated' && family.status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (auth.status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (auth.status === 'authenticated' && family.status === 'no-family' && !inOnboardingGroup) {
      router.replace('/(onboarding)/create-family');
    } else if (auth.status === 'authenticated' && family.status === 'has-family' && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [auth, family, segments]);

  if (auth.status === 'loading' || (auth.status === 'authenticated' && family.status === 'loading')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  );
}
