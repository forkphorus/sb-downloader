import {expect, test} from 'vitest';
import fs from 'fs';
import JSZip from 'jszip';
import {getFixturePath, arrayBufferSerializer} from './test-utilities.js';
import * as SBDL from '../src/export-node.js';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('date defaults to arbitrary time for sb3 JSON project', async () => {
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb3.json')));
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.files['project.json'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(zip.files['592bae6f8bb9c8d88401b54ac431f7b6.svg'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(zip.files['83a9787d4cb6f3b7632b4ddfebf74367.wav'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(project).toMatchSnapshot();
}, 30000);

test('date defaults to arbitrary time for sb2 JSON project', async () => {
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb2.json')));
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.files['project.json'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(zip.files['0.png'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(zip.files['1.svg'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(zip.files['2.svg'].date.toUTCString()).toBe('Fri, 31 Dec 2021 00:00:00 GMT');
  expect(project).toMatchSnapshot();
}, 30000);

test('date is honored on JSON sb3 project', async () => {
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

test('date is honored on JSON sb2 project', async () => {
  const date = new Date(1000030000000);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb2.json')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.files['project.json'].date.toUTCString()).toBe(date.toUTCString());
  expect(zip.files['0.png'].date.toUTCString()).toBe(date.toUTCString());
  expect(zip.files['1.svg'].date.toUTCString()).toBe(date.toUTCString());
  expect(zip.files['2.svg'].date.toUTCString()).toBe(date.toUTCString());
  expect(project).toMatchSnapshot();
}, 30000);

test('date is honored on compressed sb3', async () => {
  const date = new Date(2498349384938);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('167118244.sb3')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.files['project.json'].date.toUTCString()).toBe(date.toUTCString());
  expect(project).toMatchSnapshot();
});

test('date is honored on compressed sb2', async () => {
  const date = new Date(1498349384938);
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('forkphorus-test-template.sb2')), {
    date
  });
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(zip.files['project.json'].date.toUTCString()).toBe(date.toUTCString());
  expect(project).toMatchSnapshot();
});

test('date is silently ignored on scratch 1', async () => {
  const date = new Date();
  const input = fs.readFileSync(getFixturePath('scratch1.sb'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    date
  });
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(input));
});
