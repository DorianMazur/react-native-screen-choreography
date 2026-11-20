import { createContext, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useStableCallback } from '../hooks/useStableCallback';

type Descriptor = { render(): ReactNode };
type LayoutProps = {
  state: { index: number; routes: readonly { key: string }[] };
  descriptors: Record<string, Descriptor>;
};

export const TrayRetentionContext = createContext<
  ((key: string) => (() => void) | undefined) | null
>(null);

function TrayStackLayout({ state, descriptors }: LayoutProps) {
  const [exiting, setExiting] = useState<Record<string, Descriptor>>({});
  const retain = useStableCallback((key: string) => {
    const descriptor = descriptors[key];
    if (!descriptor) return;
    setExiting((current) => ({ ...current, [key]: descriptor }));
    return () => {
      setExiting(({ [key]: _released, ...rest }) => rest);
    };
  });
  const focused = state.routes[state.index]?.key;
  const routes = state.routes.slice(0, state.index + 1).map(({ key }) => key);
  return (
    <TrayRetentionContext.Provider value={retain}>
      <View style={styles.stack}>
        {[
          ...routes,
          ...Object.keys(exiting).filter((key) => !routes.includes(key)),
        ].map((key) => (
          <View
            key={key}
            // Flattening this wrapper on focus can briefly detach its scroll
            // view. iOS then emits momentum-end and consumes the next press.
            collapsable={false}
            style={StyleSheet.absoluteFill}
            pointerEvents="box-none"
            accessibilityElementsHidden={key !== focused}
            importantForAccessibility={
              key === focused ? 'auto' : 'no-hide-descendants'
            }
          >
            {(descriptors[key] ?? exiting[key])!.render()}
          </View>
        ))}
      </View>
    </TrayRetentionContext.Provider>
  );
}

/** Place the app navigator and its tray routes in the same native view hierarchy. */
export function trayStackLayout(props: LayoutProps) {
  return <TrayStackLayout {...props} />;
}

const styles = StyleSheet.create({ stack: { flex: 1 } });
