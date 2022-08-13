import {expect, test} from 'vitest';
import fs from 'fs';
import JSZip from 'jszip';
import {getFixturePath, arrayBufferSerializer} from './test-utilities.js';
import * as SBDL from '../src/export-node.js';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('date defaults to a constant arbitrary time', async () => {
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb3.json')));
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.files['project.json'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(zip.files['592bae6f8bb9c8d88401b54ac431f7b6.svg'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(zip.files['83a9787d4cb6f3b7632b4ddfebf74367.wav'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(project).toMatchSnapshot();
}, 30000);

test('date option', async () => {
  const date = new Date(1000030000000);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb3.json')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.files['project.json'].date.toUTCString()).toBe(date.toUTCString());
  expect(zip.files['592bae6f8bb9c8d88401b54ac431f7b6.svg'].date.toUTCString()).toBe(date.toUTCString());
  expect(zip.files['83a9787d4cb6f3b7632b4ddfebf74367.wav'].date.toUTCString()).toBe(date.toUTCString());
  expect(project).toMatchSnapshot();
}, 30000);
