import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as SBDL from '../src/export-node.js';
import {getFixturePath} from './test-utilities.js';

test('sb project from sb', async () => {
  const fixture = getFixturePath('scratch1.sb');
  const originalData = fs.readFileSync(fixture);
  const project = await SBDL.downloadProjectFromBuffer(originalData);
  assert.equal(project.type, 'sb');
  assert.equal(project.title, '');
  assert.deepEqual(new Uint8Array(project.arrayBuffer), new Uint8Array(originalData));
});
