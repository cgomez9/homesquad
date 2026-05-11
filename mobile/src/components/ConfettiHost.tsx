import { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { setConfettiFire } from '../lib/feedback';

export function ConfettiHost() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);

  useEffect(() => {
    setConfettiFire(() => ref.current?.start());
    return () => setConfettiFire(() => {});
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      <ConfettiCannon
        ref={(r) => { ref.current = r; }}
        count={80}
        origin={{ x: 200, y: 0 }}
        autoStart={false}
        fadeOut
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%', zIndex: 1000 },
});
