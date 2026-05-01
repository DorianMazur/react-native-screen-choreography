declare module 'react-native/Libraries/Utilities/codegenNativeComponent' {
  import type { HostComponent } from 'react-native';

  export default function codegenNativeComponent<Props extends object>(
    componentName: string
  ): HostComponent<Props>;
}

declare module 'react-native/Libraries/Types/CodegenTypes' {
  export type Double = number;

  export type DirectEventHandler<T> = (event: { nativeEvent: T }) => void;
}
