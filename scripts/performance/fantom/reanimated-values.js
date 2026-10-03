// Fantom has no Reanimated UI runtime. The production coordinator only needs
// mutable value storage for progress and presentation state. Deliberately export
// no animation, event, hook or scheduling APIs: this is not a Reanimated mock
// suitable for rendering the library's components or measuring UI-runtime cost.
export function makeMutable(value) {
  return { value };
}
