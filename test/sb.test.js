import fs from 'fs';
import * as SBDL from '../src/export-node.js';
import {getFixturePath} from './test-utilities.js';
import {expect, test} from 'vitest';

test('sb project from sb', async () => {
  const fixture = getFixturePath('scratch1.sb');
  const originalData = fs.readFileSync(fixture);
  const project = await SBDL.downloadProjectFromBuffer(originalData);
  expect(project.type).toBe('sb');
  expect(project.title).toBe('');
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(originalData));
});
