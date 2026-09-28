import type { HostComponent, ViewProps } from 'react-native';
import 'react-native-teleport';

type HostProps = ViewProps & { name: string };
const PortalHostView = 'PortalHostView' as unknown as HostComponent<HostProps>;

export function TransitionPortalHost({ name, ...props }: HostProps) {
  return <PortalHostView {...props} name={name} testID={name} />;
}
