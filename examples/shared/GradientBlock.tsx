import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

interface GradientBlockProps {
  from: string;
  to: string;
  angle?: number;
  style?: ViewStyle | ViewStyle[];
  borderRadius?: number;
  children?: React.ReactNode;
}

export function GradientBlock({
  from,
  to,
  angle = 160,
  style,
  borderRadius,
  children,
}: GradientBlockProps) {
  return (
    <View
      style={[
        styles.block,
        {
          borderRadius,
          experimental_backgroundImage: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
});
