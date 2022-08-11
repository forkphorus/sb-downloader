import path from 'path';
import crypto from 'crypto';

// vitest snapshots do not handle ArrayBuffers properly by default
export const arrayBufferSerializer = {
  serialize: (value, config, indentation, depth, refs, printer) => {
    const hash = crypto.createHash('sha256').update(new Uint8Array(value)).digest('hex');
    return `ArrayBuffer [SHA-256 ${hash}]`;
  },
  test: (val) => val instanceof ArrayBuffer
};

export const getFixturePath = (name) => path.join(__dirname, 'fixtures', name);
