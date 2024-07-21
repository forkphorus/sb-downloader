import fs from 'fs';
import JSZip from 'jszip';
import {expect, test, vi} from 'vitest';
import * as SBDL from '../src/export-node.js';
import {getFixturePath, arrayBufferSerializer} from './test-utilities.js';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('sb2 project from JSON', async () => {
  const fixture = getFixturePath('sb2-167118244.json');
  const project1 = await SBDL.downloadProjectFromJSON(fs.readFileSync(fixture, 'utf-8'));
  const project2 = await SBDL.downloadProjectFromJSON(JSON.parse(fs.readFileSync(fixture, 'utf-8')));
  const project3 = await SBDL.downloadProjectFromBuffer(fs.readFileSync(fixture));
  expect(project1.type).toBe('sb2');
  expect(project1.title).toBe('');
  expect(project1.arrayBuffer).instanceOf(ArrayBuffer);
  // All methods of loading the project should result in identical data
  expect(project1).toStrictEqual(project2);
  expect(project2).toStrictEqual(project3);
  // The data should not change unexpectedly
  expect(project1).toMatchSnapshot();
}, 30000);

test('sb2 project from sb2', async () => {
  const fixture = getFixturePath('167118244.sb2');
  const originalData = fs.readFileSync(fixture);
  const project = await SBDL.downloadProjectFromBuffer(originalData);
  expect(project.type).toBe('sb2');
  expect(project.title).toBe('');
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(originalData.buffer));
});

test('sb2 with non-standard JSON', async () => {
  for (const fixture of [getFixturePath('non-standard-json-sb2.json'), getFixturePath('non-standard-json.sb2')]) {
    const processJSON = vi.fn((type, data) => {
      expect(type).toBe('sb2');
      expect(data.variables[0].value).toBe(NaN);
      expect(data.variables[1].value).toBe(Infinity);
      return {
        something: [Infinity, -Infinity, NaN]
      };
    });
    const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(fixture), {
      processJSON
    });
    expect(processJSON).toHaveBeenCalledOnce();
    const zip = await JSZip.loadAsync(project.arrayBuffer);
    expect(await zip.file('project.json').async('text')).toBe('{"something":[Infinity,-Infinity,NaN]}');
  }
}, 30000);

test('sb2 with missing assets', async () => {
  const data = fs.readFileSync(getFixturePath('missing-assets.sb2'));
  const project = await SBDL.downloadProjectFromBuffer(data);
  expect(new Uint8Array(project.arrayBuffer)).toMatchSnapshot();
});
