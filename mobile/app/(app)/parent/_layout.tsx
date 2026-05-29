import { Tabs } from 'expo-router';
import { ParentTabBar } from '../../../src/components/ParentTabBar';

export default function ParentLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <ParentTabBar {...props} />}
    >
      <Tabs.Screen name="index"      options={{ title: 'Chores' }} />
      <Tabs.Screen name="my-chores"  options={{ title: 'My Chores' }} />
      <Tabs.Screen name="rewards"    options={{ title: 'Rewards' }} />
      <Tabs.Screen name="approvals"  options={{ title: 'Approvals' }} />
      <Tabs.Screen name="activity"   options={{ title: 'Activity' }} />
      <Tabs.Screen name="settings"   options={{ title: 'Settings' }} />
      <Tabs.Screen name="leaderboard" options={{ href: null, title: 'Leaderboard' }} />
      <Tabs.Screen name="goals"       options={{ href: null, title: 'Goals' }} />
    </Tabs>
  );
}
