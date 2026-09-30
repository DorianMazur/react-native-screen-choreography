const path = require('path');
const vm = require('vm');
const { transformFileSync } = require('@babel/core');

function loadUiObserver() {
  const previousBabelEnv = process.env.BABEL_ENV;
  let code;
  try {
    process.env.BABEL_ENV = 'production';
    ({ code } = transformFileSync(
      path.resolve(
        __dirname,
        '../examples/react-navigation/src/performance/motion.ts'
      ),
      {
        configFile: false,
        babelrc: false,
        presets: [
          ['module:@react-native/babel-preset', { enableBabelRuntime: false }],
        ],
        plugins: ['react-native-worklets/plugin'],
      }
    ));
  } finally {
    if (previousBabelEnv === undefined) delete process.env.BABEL_ENV;
    else process.env.BABEL_ENV = previousBabelEnv;
  }

  const exports = {};
  vm.runInNewContext(code, { exports });
  const uiRuntime = vm.createContext({});
  function unpack(value) {
    if (typeof value !== 'function' || !value.__initData) return value;
    const closure = Object.fromEntries(
      Object.entries(value.__closure).map(([key, captured]) => [
        key,
        unpack(captured),
      ])
    );
    // Use the captured values from module initialization. Substituting exports
    // here would conceal a helper captured before its worklet factory ran.
    return vm
      .runInContext(`(${value.__initData.code})`, uiRuntime)
      .bind({ __closure: closure });
  }
  return unpack(exports.installMotionObserver);
}

function signal(initial) {
  let value = initial;
  const listeners = new Map();
  return {
    get value() {
      return value;
    },
    set value(next) {
      value = next;
      listeners.forEach((listener) => listener(next));
    },
    addListener: (id, listener) => listeners.set(id, listener),
    removeListener: (id) => listeners.delete(id),
    listenerCount: () => listeners.size,
  };
}

test.each(['forward', 'backward'])(
  '%s motion observer survives the first request and retains handoff through cleanup in a production UI runtime',
  (direction) => {
    const installObserver = loadUiObserver();
    const endpoint = direction === 'forward' ? 1 : 0;
    const request = signal(null);
    const progress = signal(1 - endpoint);
    const handoff = signal({ sessionId: null, completed: false });
    const samples = [];
    let now = 100;
    const dispose = installObserver({
      request,
      progress,
      handoff,
      listenerId: -1,
      now: () => now,
      deliver: (sample) => samples.push(sample),
    });

    // Mounting with no request succeeds even when a worklet helper was captured
    // as undefined. The first tap must exercise the serialized helper call.
    request.value = { requestId: 1, direction, sessionId: null };
    now = 110;
    request.value = { requestId: 1, direction, sessionId: 'session' };
    handoff.value = { sessionId: 'session', completed: false };
    now = 120;
    progress.value = 0.5;
    now = 200;
    progress.value = endpoint;
    handoff.value = { sessionId: 'stale', completed: true };
    expect(samples).toHaveLength(0);
    now = 205;
    handoff.value = { sessionId: 'session', completed: true };
    handoff.value = { sessionId: null, completed: false };
    progress.value = 1 - endpoint;

    expect(samples).toEqual([
      { requestId: 1, firstMotionMs: 120, motionEndMs: 200, handoffMs: 205 },
    ]);
    progress.value = endpoint;
    handoff.value = { sessionId: 'session', completed: true };
    expect(samples).toHaveLength(1);
    dispose();
    expect(request.listenerCount()).toBe(0);
    expect(progress.listenerCount()).toBe(0);
    expect(handoff.listenerCount()).toBe(0);
  }
);
