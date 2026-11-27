import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from '@turbowarp/jszip';
import * as SBDL from '../src/export-node.js';
import {getFixturePath} from './test-utilities.js';

test('sb3 project from JSON', {timeout: 30000}, async (t) => {
  const fixture = getFixturePath('sb3-167118244.json');
  const project1 = await SBDL.downloadProjectFromJSON(fs.readFileSync(fixture, 'utf-8'));
  const project2 = await SBDL.downloadProjectFromJSON(JSON.parse(fs.readFileSync(fixture, 'utf-8')));
  const project3 = await SBDL.downloadProjectFromBuffer(fs.readFileSync(fixture));
  assert.equal(project1.type, 'sb3');
  assert.equal(project1.title, '');
  assert.ok(project1.arrayBuffer instanceof ArrayBuffer);
  // All methods of loading the project should result in identical data
  assert.deepEqual(project1, project2);
  assert.deepEqual(project2, project3);
  // The data should not change unexpectedly
  t.assert.snapshot(project1);
});

test('sb3 project from sb3', async () => {
  const fixture = getFixturePath('167118244.sb3');
  const originalData = fs.readFileSync(fixture);
  const project = await SBDL.downloadProjectFromBuffer(originalData);
  assert.equal(project.type, 'sb3');
  assert.equal(project.title, '');
  assert.deepEqual(new Uint8Array(project.arrayBuffer), new Uint8Array(originalData.buffer));
});

test('sb3 project from sb3 with project.json in a subdirectory', async (t) => {
  const fixture = getFixturePath('json-in-subdirectory.sb3');
  const originalData = fs.readFileSync(fixture);
  const project = await SBDL.downloadProjectFromBuffer(originalData);
  assert.equal(project.type, 'sb3');
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.file('this is a subdirectory/project.json'), null);
  assert.equal(zip.file('this is a subdirectory/9838d02002d05f88dc54d96494fbc202.png'), null);
  assert.notEqual(zip.file('project.json'), null);
  assert.notEqual(zip.file('9838d02002d05f88dc54d96494fbc202.png'), null);
  t.assert.snapshot(project.arrayBuffer);
});

test('downloads missing assets', async (t) => {
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
  assert.equal(loadedAssets, 3);
  assert.equal(totalAssets, 3);
  t.assert.snapshot(project1.arrayBuffer);

  const subdirectoryFixtureData = fs.readFileSync(getFixturePath('missing-assets-subdir.sb3'));
  const project2 = await SBDL.downloadProjectFromBuffer(subdirectoryFixtureData);
  t.assert.snapshot(project2.arrayBuffer);

  // Both of the fixtures are the same project, just one of them has some files in subdirectories
  // The actual order of the files in the zip is not necessarily the same (so they may not be
  // the same SHA-256) but the contents in those files should be.

  const zip1 = await JSZip.loadAsync(project1.arrayBuffer);
  const zip2 = await JSZip.loadAsync(project2.arrayBuffer);
  assert.deepEqual(Object.keys(zip1).sort(), Object.keys(zip2).sort());
  for (const path of Object.keys(zip1.files)) {
    assert.deepEqual(await zip1.file(path).async('uint8array'), await zip2.file(path).async('uint8array'));
  }
});

test('extra empty subdirectory is removed', async (t) => {
  const fixtureData = fs.readFileSync(getFixturePath('extra-empty-subdirectory.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(fixtureData);
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.files['empty/'], undefined);
  t.assert.snapshot(project.arrayBuffer);
});
