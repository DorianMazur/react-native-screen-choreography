import { Image, View } from 'react-native';
import type { Token } from './data';

interface TokenLogoProps {
  token: Token;
  size: number;
}

const ICON_BASE =
  'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons/128/color';

export function TokenLogo({ token, size }: TokenLogoProps) {
  const radius = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: radius }}>
      <Image
        source={{ uri: `${ICON_BASE}/${token.symbol.toLowerCase()}.png` }}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="contain"
      />
    </View>
  );
}
