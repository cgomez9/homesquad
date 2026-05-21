// Shared "Tide Pool" atmosphere — soft sun glow + layered tide arcs, built
// from plain Views (no gradient/SVG dependency). Render as the first child of
// a flex/relative container; later siblings paint on top of it.
//
// Atmosphere colors live in the active palette so the scene swaps from warm
// shoreline (light) to deep navy beach (dark) automatically.
import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme, type Palette } from '../theme';

export function TidePoolBackground({ foam = true }: { foam?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View pointerEvents="none" style={styles.fill}>
      <View style={styles.sunWrap}>
        <View style={[styles.sunRing, styles.sun1]} />
        <View style={[styles.sunRing, styles.sun2]} />
        <View style={[styles.sunRing, styles.sun3]} />
      </View>
      <View style={styles.tideWrap}>
        <View style={[styles.arc, styles.arc1]} />
        <View style={[styles.arc, styles.arc2]} />
        <View style={[styles.arc, styles.arc3]} />
        {foam && (
          <>
            <View style={[styles.foam, { left: 44, bottom: 168, width: 7, height: 7 }]} />
            <View style={[styles.foam, { left: 60, bottom: 154, width: 5, height: 5 }]} />
            <View style={[styles.foam, { right: 52, bottom: 188, width: 9, height: 9 }]} />
            <View style={[styles.foam, { right: 70, bottom: 172, width: 5, height: 5 }]} />
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, overflow: 'hidden' },

    sunWrap: { position: 'absolute', top: -70, right: -50 },
    sunRing: { position: 'absolute', borderRadius: 999 },
    sun1: { width: 280, height: 280, backgroundColor: colors.atmosphereSun1, top: 0, right: 0 },
    sun2: { width: 200, height: 200, backgroundColor: colors.atmosphereSun2, top: 40, right: 40 },
    sun3: { width: 120, height: 120, backgroundColor: colors.atmosphereSun3, top: 80, right: 80 },

    tideWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', overflow: 'hidden' },
    arc: { position: 'absolute', borderTopLeftRadius: 600, borderTopRightRadius: 600 },
    arc1: { left: '-22%', right: '-22%', height: 360, bottom: -150, backgroundColor: colors.atmosphereArc1 },
    arc2: { left: '-14%', right: '-14%', height: 300, bottom: -160, backgroundColor: colors.atmosphereArc2 },
    arc3: { left: '-8%', right: '-8%', height: 240, bottom: -170, backgroundColor: colors.atmosphereArc3 },
    foam: { position: 'absolute', borderRadius: 999, backgroundColor: colors.atmosphereFoam },
  });
