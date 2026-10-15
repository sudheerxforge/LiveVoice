import React, { FC, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

interface BlobSpec {
  color: string;
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  dx: number;
  dy: number;
  duration: number;
}

const BLOBS: BlobSpec[] = [
  { color: theme.blue, size: 300, top: -110, left: -110, dx: 40, dy: 30, duration: 9000 },
  { color: theme.violet, size: 280, top: 220, right: -140, dx: -35, dy: 40, duration: 11000 },
  { color: theme.pink, size: 260, bottom: -120, left: 40, dx: 30, dy: -35, duration: 13000 },
];

const Blob: FC<{ spec: BlobSpec }> = ({ spec }) => {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: spec.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: spec.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, spec.duration]);

  return (
    <Animated.View
      style={[
        styles.blob,
        {
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
          top: spec.top,
          bottom: spec.bottom,
          left: spec.left,
          right: spec.right,
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, spec.dx] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, spec.dy] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
        },
      ]}
    />
  );
};

/** Slow, soft colour blobs drifting behind the screen. Purely decorative. */
const AmbientBackground: FC = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {BLOBS.map((b, i) => (
      <Blob key={i} spec={b} />
    ))}
  </View>
);

export default AmbientBackground;

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    opacity: 0.13,
  },
});
