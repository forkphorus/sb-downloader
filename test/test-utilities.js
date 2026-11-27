import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {snapshot} from 'node:test';

const describeArrayBuffer = (arrayBuffer) => {
  const hash = crypto.createHash('sha256').update(new Uint8Array(arrayBuffer)).digest('hex');
  return `ArrayBuffer [SHA-256 ${hash}]`;
};

const snapshotReplacer = (key, value) => {
  if (value instanceof ArrayBuffer) {
    return describeArrayBuffer(value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // Sort keys so snapshots don't depend on property insertion order
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]));
  }
  return value;
};

// The default serializer is JSON.stringify, which turns ArrayBuffers into {}.
// Store a hash instead so snapshots actually check the data.
snapshot.setDefaultSnapshotSerializers([
  (value) => {
    if (value instanceof ArrayBuffer) {
      return describeArrayBuffer(value);
    }
    return JSON.stringify(value, snapshotReplacer, 2);
  }
]);

/**
 * @param {ReturnType<import('node:test').mock.fn>} fn
 * @param {unknown[]} args
 */
export const assertCalledWith = (fn, ...args) => {
  const calls = fn.mock.calls.map((call) => call.arguments);
  assert.ok(
    calls.some((callArgs) => isDeepStrictEqual(callArgs, args)),
    `Expected a call with ${JSON.stringify(args)}, got ${JSON.stringify(calls)}`
  );
};

export const getFixturePath = (name) => path.join(import.meta.dirname, 'fixtures', name);
