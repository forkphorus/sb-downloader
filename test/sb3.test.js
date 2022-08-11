import fs from 'fs';
import * as SBDL from '../src/export-node.js';
import {getFixturePath, arrayBufferSerializer} from './test-utilities.js';
import {expect, test} from 'vitest';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('sb3 project from JSON', async () => {
  const fixture = getFixturePath('sb3-167118244.json');
  const project1 = await SBDL.downloadProjectFromJSON(fs.readFileSync(fixture, 'utf-8'));
  const project2 = await SBDL.downloadProjectFromJSON(JSON.parse(fs.readFileSync(fixture, 'utf-8')));
  const project3 = await SBDL.downloadProjectFromBuffer(fs.readFileSync(fixture));
  expect(project1.type).toBe('sb3');
  expect(project1.title).toBe('');
  expect(project1.arrayBuffer).instanceOf(ArrayBuffer);
  // All methods of loading the project should result in identical data
  expect(project1).toStrictEqual(project2);
  expect(project2).toStrictEqual(project3);
  // The data should not change unexpectedly
  expect(project1).toMatchSnapshot();
}, 30000);

test('sb3 project from sb3', async () => {
  const fixture = getFixturePath('167118244.sb3');
  const originalData = fs.readFileSync(fixture);
  const project = await SBDL.downloadProjectFromBuffer(originalData);
  expect(project.type).toBe('sb3');
  expect(project.title).toBe('');
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(originalData.buffer));
});

test('sb3 project from sb3 with project.json in a subdirectory', async () => {
  const fixture = getFixturePath('json-in-subdirectory.sb3');
  const originalData = fs.readFileSync(fixture);
  const project = await SBDL.downloadProjectFromBuffer(originalData);
  expect(project.type).toBe('sb3');
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(originalData.buffer));
});
