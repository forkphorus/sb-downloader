import * as fs from 'fs';
import {expect, test, vi} from 'vitest';
import * as JSZip from '@turbowarp/jszip';
import * as SBDL from '../src/export-node.js';
import {arrayBufferSerializer, getFixturePath} from './test-utilities';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('sb2 referencing non-existent assets', async () => {
  const fixtureData = fs.readFileSync(getFixturePath('non-existent-assets.sb2'));
  const onProgress = vi.fn();
  const project = await SBDL.downloadProjectFromBuffer(fixtureData, {
    onProgress
  });
  expect(onProgress).toHaveBeenCalledWith('assets', 0, 1);
  expect(onProgress).toHaveBeenCalledWith('assets', 1, 1);

  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(Object.keys(zip.files)).toStrictEqual(['project.json']);
}, 30000);

test('sb3 referencing non-existent assets', async () => {
  const fixtureData = fs.readFileSync(getFixturePath('non-existent-assets.sb3'));
  const onProgress = vi.fn();
  const project = await SBDL.downloadProjectFromBuffer(fixtureData, {
    onProgress
  });
  expect(onProgress).toHaveBeenCalledWith('assets', 0, 1);
  expect(onProgress).toHaveBeenCalledWith('assets', 1, 1);

  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(Object.keys(zip.files)).toStrictEqual(['project.json']);
}, 30000);
