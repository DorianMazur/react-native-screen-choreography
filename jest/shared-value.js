const React = require('react');
const noop = () => {};

function mutable(initialValue) {
  return {
    value: initialValue,
    get() {
      return this.value;
    },
    set(value) {
      this.value = typeof value === 'function' ? value(this.value) : value;
    },
    modify(modifier) {
      if (modifier) this.value = modifier(this.value);
    },
    addListener: noop,
    removeListener: noop,
  };
}

function useMutable(value) {
  const [shared] = React.useState(() => mutable(value));
  return shared;
}

module.exports = { mutable, useMutable };
