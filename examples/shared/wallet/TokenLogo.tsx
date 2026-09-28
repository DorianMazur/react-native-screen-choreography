import { Image, View } from 'react-native';
import type { Token } from './data';

interface TokenLogoProps {
  token: Token;
  size: number;
  onLoad?: () => void;
  onError?: () => void;
}

const ICON_BASE =
  'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons/128/color';

export const tokenLogoUri = (token: Token) =>
  `${ICON_BASE}/${token.symbol.toLowerCase()}.png`;

export function TokenLogo({ token, size, onLoad, onError }: TokenLogoProps) {
  const radius = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: radius }}>
      <Image
        source={{ uri: tokenLogoUri(token) }}
        onLoad={onLoad}
        onError={onError}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="contain"
      />
    </View>
  );
}
