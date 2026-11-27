import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from '@turbowarp/jszip';
import * as SBDL from '../src/export-node.js';
import {assertCalledWith, getFixturePath} from './test-utilities.js';

test('sb2 referencing non-existent assets', {timeout: 30000}, async () => {
  const fixtureData = fs.readFileSync(getFixturePath('non-existent-assets.sb2'));
  const onProgress = mock.fn();
  const project = await SBDL.downloadProjectFromBuffer(fixtureData, {
    onProgress
  });
  assertCalledWith(onProgress, 'assets', 0, 1);
  assertCalledWith(onProgress, 'assets', 1, 1);

  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.deepEqual(Object.keys(zip.files), ['project.json']);
});

test('sb3 referencing non-existent assets', {timeout: 30000}, async () => {
  const fixtureData = fs.readFileSync(getFixturePath('non-existent-assets.sb3'));
  const onProgress = mock.fn();
  const project = await SBDL.downloadProjectFromBuffer(fixtureData, {
    onProgress
  });
  assertCalledWith(onProgress, 'assets', 0, 1);
  assertCalledWith(onProgress, 'assets', 1, 1);

  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.deepEqual(Object.keys(zip.files), ['project.json']);
});
