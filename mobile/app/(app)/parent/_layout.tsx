import { Tabs } from 'expo-router';

export default function ParentLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index"     options={{ title: 'Chores' }} />
      <Tabs.Screen name="rewards"   options={{ title: 'Rewards' }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals' }} />
      <Tabs.Screen name="activity"  options={{ title: 'Activity' }} />
      <Tabs.Screen name="settings"  options={{ title: 'Settings' }} />
    </Tabs>
  );
}
