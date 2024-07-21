import fs from 'fs';
import * as SBDL from '../src/export-node.js';
import JSZip from 'jszip';
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
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.file('this is a subdirectory/project.json')).toBeNull();
  expect(zip.file('this is a subdirectory/9838d02002d05f88dc54d96494fbc202.png')).toBeNull();
  expect(zip.file('project.json')).not.toBeNull();
  expect(zip.file('9838d02002d05f88dc54d96494fbc202.png')).not.toBeNull();
  expect(project.arrayBuffer).toMatchSnapshot();
});

test('downloads missing assets', async () => {
  const rootFixtureData = fs.readFileSync(getFixturePath('missing-assets-root.sb3'));
  let loadedAssets = -1;
  let totalAssets = -1;
  const project1 = await SBDL.downloadProjectFromBuffer(rootFixtureData, {
    onProgress: (type, loaded, total) => {
      if (type === 'assets') {
        loadedAssets = loaded;
        totalAssets = total;
      }
    }
  });
  expect(loadedAssets).toBe(3);
  expect(totalAssets).toBe(3);
  expect(project1.arrayBuffer).toMatchSnapshot();

  const subdirectoryFixtureData = fs.readFileSync(getFixturePath('missing-assets-subdir.sb3'));
  const project2 = await SBDL.downloadProjectFromBuffer(subdirectoryFixtureData);
  expect(project2.arrayBuffer).toMatchSnapshot();

  // Both of the fixtures are the same project, just one of them has some files in subdirectories
  // The actual order of the files in the zip is not necessarily the same (so they may not be 
  // the same SHA-256) but the contents in those files should be.

  const zip1 = await JSZip.loadAsync(project1.arrayBuffer);
  const zip2 = await JSZip.loadAsync(project2.arrayBuffer);
  expect(Object.keys(zip1).sort()).toStrictEqual(Object.keys(zip2).sort());
  for (const path of Object.keys(zip1.files)) {
    expect(await zip1.file(path).async('uint8array')).toStrictEqual(await zip2.file(path).async('uint8array'));
  }
});
