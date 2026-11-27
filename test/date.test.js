import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from '@turbowarp/jszip';
import {getFixturePath} from './test-utilities.js';
import * as SBDL from '../src/export-node.js';

test('date defaults to arbitrary time for sb3 JSON project', {timeout: 30000}, async (t) => {
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb3.json')));
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.files['project.json'].date.toUTCString(), 'Fri, 31 Dec 2021 00:00:00 GMT');
  assert.equal(zip.files['592bae6f8bb9c8d88401b54ac431f7b6.svg'].date.toUTCString(), 'Fri, 31 Dec 2021 00:00:00 GMT');
  assert.equal(zip.files['83a9787d4cb6f3b7632b4ddfebf74367.wav'].date.toUTCString(), 'Fri, 31 Dec 2021 00:00:00 GMT');
  t.assert.snapshot(project);
});

test('date defaults to arbitrary time for sb2 JSON project', {timeout: 30000}, async (t) => {
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb2.json')));
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.files['project.json'].date.toUTCString(), 'Fri, 31 Dec 2021 00:00:00 GMT');
  assert.equal(zip.files['0.png'].date.toUTCString(), 'Fri, 31 Dec 2021 00:00:00 GMT');
  assert.equal(zip.files['1.svg'].date.toUTCString(), 'Fri, 31 Dec 2021 00:00:00 GMT');
  assert.equal(zip.files['2.svg'].date.toUTCString(), 'Fri, 31 Dec 2021 00:00:00 GMT');
  t.assert.snapshot(project);
});

test('date is honored on JSON sb3 project', {timeout: 30000}, async (t) => {
  const date = new Date(1000030000000);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb3.json')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.files['project.json'].date.toUTCString(), date.toUTCString());
  assert.equal(zip.files['592bae6f8bb9c8d88401b54ac431f7b6.svg'].date.toUTCString(), date.toUTCString());
  assert.equal(zip.files['83a9787d4cb6f3b7632b4ddfebf74367.wav'].date.toUTCString(), date.toUTCString());
  t.assert.snapshot(project);
});

test('date is honored on JSON sb2 project', {timeout: 30000}, async (t) => {
  const date = new Date(1000030000000);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb2.json')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.files['project.json'].date.toUTCString(), date.toUTCString());
  assert.equal(zip.files['0.png'].date.toUTCString(), date.toUTCString());
  assert.equal(zip.files['1.svg'].date.toUTCString(), date.toUTCString());
  assert.equal(zip.files['2.svg'].date.toUTCString(), date.toUTCString());
  t.assert.snapshot(project);
});

test('date is honored on compressed sb3', async (t) => {
  const date = new Date(2498349384938);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('167118244.sb3')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.files['project.json'].date.toUTCString(), date.toUTCString());
  t.assert.snapshot(project);
});

test('date is honored on compressed sb2', async (t) => {
  const date = new Date(1498349384938);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('forkphorus-test-template.sb2')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.files['project.json'].date.toUTCString(), date.toUTCString());
  t.assert.snapshot(project);
});

test('date is silently ignored on scratch 1', async () => {
  const date = new Date();
  const input = fs.readFileSync(getFixturePath('scratch1.sb'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    date
  });
  assert.deepEqual(new Uint8Array(project.arrayBuffer), new Uint8Array(input));
});
