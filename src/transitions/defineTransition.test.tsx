import type { ComponentProps, ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SharedElement } from '../components/SharedElement';
import {
  TransitionPresentationContext,
  useTransitionPresentation,
} from '../core/TransitionPresentationContext';
import { defineTransition } from './defineTransition';
import { fade, image, surface, text } from './declarativeRecipes';

jest.mock('../components/SharedElement', () => ({
  SharedElement: Object.assign(
    jest.fn(() => null),
    { Target: jest.fn(() => null) }
  ),
}));

describe('defineTransition', () => {
  const trees: ReactTestRenderer[] = [];

  async function render(element: ReactElement) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(element);
    });
    trees.push(tree);
    return tree;
  }

  afterEach(async () => {
    await act(async () => {
      trees.splice(0).forEach((tree) => tree.unmount());
    });
    jest.clearAllMocks();
  });

  test('forwards endpoint content and group with a stable per-role transition', async () => {
    const transition = defineTransition({
      shared: { photo: image({ zIndex: 2 }), title: text({ zIndex: 3 }) },
    });
    const style = { width: 120 };
    const tree = await render(
      <transition.Element name="photo" groupId="article:one" style={style}>
        initial photo
      </transition.Element>
    );
    const first = tree.root.findByType(SharedElement).props;

    expect(first.id).toBe('photo');
    expect(first.groupId).toBe('article:one');
    expect(first.style).toBe(style);
    expect(first.children).toBe('initial photo');
    expect(first).not.toHaveProperty('name');
    expect(first.transition.zIndex).toBe(2);

    await act(async () => {
      tree.update(
        <transition.Element name="photo" groupId="article:two">
          updated photo
        </transition.Element>
      );
    });
    const second = tree.root.findByType(SharedElement).props;
    expect(second.id).toBe('photo');
    expect(second.groupId).toBe('article:two');
    expect(second.children).toBe('updated photo');
    expect(second.transition).toBe(first.transition);

    await act(async () => {
      tree.update(
        <transition.Element name="title" groupId="article:two">
          title
        </transition.Element>
      );
    });
    const title = tree.root.findByType(SharedElement).props;
    expect(title.id).toBe('title');
    expect(title.transition.zIndex).toBe(3);
    expect(title.transition).not.toBe(first.transition);
  });

  test('exposes the nested measurement Target without a second role registration', async () => {
    const transition = defineTransition({ shared: { photo: image() } });
    expect(transition.Element.Target).toBe(SharedElement.Target);
    const style = { height: 40 };
    const tree = await render(
      <transition.Element.Target style={style}>
        measured child
      </transition.Element.Target>
    );

    const target = tree.root.findByType(SharedElement.Target);
    expect(target.props.style).toBe(style);
    expect(target.props.children).toBe('measured child');
    expect(tree.root.findAllByType(SharedElement)).toHaveLength(0);
  });

  test('classifies shared, expanded-only, collapsed-only, and dual-endpoint roles', async () => {
    const transition = defineTransition({
      shared: { frame: surface() },
      enter: { body: fade(), action: fade() },
      exit: { preview: fade(), action: fade() },
    });
    const roles = ['frame', 'body', 'preview', 'action'] as const;
    const tree = await render(
      <>
        {roles.map((role) => (
          <transition.Element key={role} name={role} groupId="article:one">
            {role}
          </transition.Element>
        ))}
      </>
    );
    const definitions = tree.root.findAllByType(SharedElement).map((node) => ({
      role: node.props.id,
      unpaired: node.props.transition.unpaired,
      frozen: Object.isFrozen(node.props.transition),
    }));

    expect(definitions).toEqual([
      { role: 'frame', unpaired: undefined, frozen: true },
      { role: 'body', unpaired: 'expanded', frozen: true },
      { role: 'preview', unpaired: 'collapsed', frozen: true },
      { role: 'action', unpaired: 'either', frozen: true },
    ]);
  });

  test.each(['enter', 'exit'] as const)(
    'rejects a role used for both shared content and %s',
    (side) => {
      expect(() =>
        defineTransition({
          shared: { title: text() },
          [side]: { title: fade() },
        })
      ).toThrow('cannot be shared and enter/exit');
    }
  );

  test('accepts matching enter/exit stacking and treats omitted zIndex as zero', () => {
    expect(() =>
      defineTransition({
        enter: { action: fade({ zIndex: 3 }) },
        exit: { action: fade({ zIndex: 3 }) },
      })
    ).not.toThrow();
    expect(() =>
      defineTransition({
        enter: { action: fade() },
        exit: { action: fade({ zIndex: 0 }) },
      })
    ).not.toThrow();
    expect(() =>
      defineTransition({
        enter: { action: fade({ zIndex: 2 }) },
        exit: { action: fade({ zIndex: 3 }) },
      })
    ).toThrow('zIndex must match');
  });

  test('accepts a single shared anchor and a fallback list of shared anchors', () => {
    expect(() =>
      defineTransition({
        shared: { frame: surface(), title: text() },
        enter: { body: fade({ follow: 'title' }) },
        exit: { preview: fade({ follow: ['title', 'frame'] }) },
      })
    ).not.toThrow();
  });

  test.each(['missing', 'preview', 'toString'])(
    'rejects non-shared follow anchor %s',
    (anchor) => {
      expect(() =>
        defineTransition({
          shared: { frame: surface() },
          enter: { body: fade({ follow: ['frame', anchor] }) },
          exit: { preview: fade() },
        })
      ).toThrow(`follows unknown shared role "${anchor}"`);
    }
  );

  test('rejects empty definitions and blank role names', () => {
    expect(() => defineTransition({})).toThrow('at least one element role');
    expect(() => defineTransition({ shared: { '': surface() } })).toThrow(
      'roles must not be empty'
    );
    expect(() => defineTransition({ enter: { '  ': fade() } })).toThrow(
      'roles must not be empty'
    );
  });

  test.each([0, -1, NaN, Infinity, -Infinity])(
    'rejects invalid duration %s',
    (duration) => {
      expect(() =>
        defineTransition({ shared: { frame: surface() }, motion: { duration } })
      ).toThrow('duration must be a finite positive number');
    }
  );

  test('copies and freezes motion so later caller changes cannot alter navigation', () => {
    const motion = { duration: 350, spring: { stiffness: 220, damping: 24 } };
    const definition = defineTransition({
      shared: { frame: surface() },
      motion,
    });
    motion.duration = 900;
    motion.spring.stiffness = 10;

    expect(definition.navigationOptions).toEqual({
      duration: 350,
      spring: { stiffness: 220, damping: 24 },
    });
    expect(definition.navigationOptions.spring).not.toBe(motion.spring);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.navigationOptions)).toBe(true);
    expect(Object.isFrozen(definition.navigationOptions.spring)).toBe(true);
    expect(
      defineTransition({ shared: { frame: surface() } }).navigationOptions
    ).toEqual({});
  });

  test('presentation context distinguishes ordinary endpoints and overlay copies', async () => {
    const values: boolean[] = [];
    function Probe() {
      values.push(useTransitionPresentation());
      return null;
    }
    const tree = await render(<Probe />);
    expect(values.at(-1)).toBe(false);

    await act(async () => {
      tree.update(
        <TransitionPresentationContext.Provider value>
          <Probe />
        </TransitionPresentationContext.Provider>
      );
    });
    expect(values.at(-1)).toBe(true);

    await act(async () => {
      tree.update(<Probe />);
    });
    expect(values.at(-1)).toBe(false);
  });
});

// Compile-time contract only: this function is intentionally never invoked.
export function checkRoleTypes() {
  const transition = defineTransition({
    shared: { photo: image() },
    enter: { body: fade() },
    exit: { preview: fade() },
  });
  const shared = (
    <transition.Element name="photo" groupId="one">
      photo
    </transition.Element>
  );
  const enter = (
    <transition.Element name="body" groupId="one">
      body
    </transition.Element>
  );
  const exit = (
    <transition.Element name="preview" groupId="one">
      preview
    </transition.Element>
  );
  // @ts-expect-error Only roles declared in this transition are accepted.
  const unknown: ComponentProps<typeof transition.Element>['name'] = 'missing';
  // @ts-expect-error Group identity is required at every endpoint.
  const noGroup = <transition.Element name="photo">photo</transition.Element>;
  return { shared, enter, exit, unknown, noGroup };
}
