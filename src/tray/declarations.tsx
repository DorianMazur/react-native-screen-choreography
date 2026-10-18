import React from 'react';
import { resolveTrayAnimation } from './animation';
import type {
  TrayParamList,
  TrayScreenDeclarationProps,
  TrayScreenOptions,
  TrayScreenProps,
  TrayStackProps,
} from './types';

export type TrayScreenMap<P extends TrayParamList> = Record<
  string,
  {
    component: React.ComponentType<TrayScreenProps<P, keyof P & string>>;
    title: string;
    presentation: NonNullable<TrayScreenOptions['presentation']>;
  }
>;

export function readTrayDeclaration<P extends TrayParamList>(
  children: React.ReactNode,
  Stack: React.ComponentType<TrayStackProps>,
  Screen: React.ComponentType<TrayScreenDeclarationProps<P>>
) {
  let declaration: React.ReactElement<TrayStackProps> | undefined;
  const collect = (nodes: React.ReactNode): React.ReactNode =>
    React.Children.map(nodes, (child) => {
      if (!React.isValidElement(child)) return child;
      if (child.type === Stack) {
        if (declaration)
          throw new Error('Tray.Provider requires exactly one Tray.Stack.');
        declaration = child as React.ReactElement<TrayStackProps>;
        return null;
      }
      if (child.type === React.Fragment) {
        const fragment = child as React.ReactElement<{
          children: React.ReactNode;
        }>;
        return React.cloneElement(
          fragment,
          undefined,
          collect(fragment.props.children)
        );
      }
      return child;
    });
  const content = collect(children);
  if (!declaration)
    throw new Error(
      'Tray.Provider requires one direct Tray.Stack child (fragments are supported).'
    );

  const { children: declarations, ...options } = declaration.props;
  const screens: TrayScreenMap<P> = Object.create(null);
  const readScreens = (nodes: React.ReactNode) =>
    React.Children.forEach(nodes, (child) => {
      if (child == null) return;
      if (React.isValidElement<{ children: React.ReactNode }>(child)) {
        if (child.type === React.Fragment) {
          readScreens(child.props.children);
          return;
        }
      }
      if (
        !React.isValidElement<TrayScreenDeclarationProps<P>>(child) ||
        child.type !== Screen
      )
        throw new Error(
          'Tray.Stack only accepts its own Tray.Screen declarations and fragments.'
        );
      const { name, component, options: screenOptions } = child.props;
      if (typeof name !== 'string' || !name.trim())
        throw new Error('Tray.Screen requires a non-empty name.');
      if (Object.prototype.hasOwnProperty.call(screens, name))
        throw new Error(`Duplicate tray screen: ${name}`);
      if (
        typeof component !== 'function' &&
        !(
          typeof component === 'object' &&
          component !== null &&
          '$$typeof' in component
        )
      )
        throw new Error(`Tray.Screen "${name}" requires a component.`);
      const title = screenOptions?.title ?? name;
      if (typeof title !== 'string')
        throw new Error(`Tray.Screen "${name}" requires a string title.`);
      const presentation = screenOptions?.presentation ?? 'tray';
      if (presentation !== 'tray' && presentation !== 'fullScreen')
        throw new Error(
          `Tray.Screen "${name}" presentation must be "tray" or "fullScreen".`
        );
      screens[name] = { component, title, presentation };
    });
  readScreens(declarations);
  if (Object.keys(screens).length === 0)
    throw new Error('Tray.Stack requires at least one Tray.Screen.');
  return {
    content,
    screens,
    options: { ...options, animation: resolveTrayAnimation(options.animation) },
  };
}
