'use strict';
const assert = require('assert');
const { transformPosition: t } = require('./positions');

const P = (line, character) => ({ line, character });
const R = (sl, sc, el, ec) => ({ start: P(sl, sc), end: P(el, ec) });

// insert 2 lines above -> line shifts down
assert.deepStrictEqual(t(P(10, 4), [{ range: R(2, 0, 2, 0), text: 'a\nb\n' }]), P(12, 4));
// delete 3 lines above
assert.deepStrictEqual(t(P(10, 4), [{ range: R(2, 0, 5, 0), text: '' }]), P(7, 4));
// change after the position: untouched
assert.deepStrictEqual(t(P(3, 1), [{ range: R(8, 0, 8, 0), text: 'x\n' }]), P(3, 1));
// position inside deleted range collapses to start
assert.deepStrictEqual(t(P(4, 2), [{ range: R(2, 1, 6, 0), text: '' }]), P(2, 1));
// same-line insert before the column
assert.deepStrictEqual(t(P(5, 10), [{ range: R(5, 2, 5, 2), text: 'abc' }]), P(5, 13));
// same-line multi-line insert before the column
assert.deepStrictEqual(t(P(5, 10), [{ range: R(5, 2, 5, 2), text: 'x\nyy' }]), P(6, 2 + 8));
// multiple changes in one event (original coordinates)
assert.deepStrictEqual(
  t(P(10, 0), [
    { range: R(1, 0, 1, 0), text: '\n' },
    { range: R(4, 0, 6, 0), text: '' },
  ]),
  P(9, 0));

// affinity: insertion exactly at a line start pushes a 'right' position down
assert.deepStrictEqual(t(P(5, 0), [{ range: R(5, 0, 5, 0), text: '\n' }]), P(5, 0));
assert.deepStrictEqual(t(P(5, 0), [{ range: R(5, 0, 5, 0), text: '\n' }], { affinity: 'right' }), P(6, 0));
// a newline added at the end of the previous line shifts it as usual
assert.deepStrictEqual(t(P(5, 0), [{ range: R(4, 3, 4, 3), text: '\n' }], { affinity: 'right' }), P(6, 0));
// replacing text that starts at the position keeps it in place
assert.deepStrictEqual(t(P(5, 0), [{ range: R(5, 0, 5, 4), text: 'zz' }], { affinity: 'right' }), P(5, 0));

console.log('positions: all tests passed');
