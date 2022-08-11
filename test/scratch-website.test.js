import {expect, test} from 'vitest';
import * as SBDL from '../src/export-node.js';

test('get latest from ID', async () => {
  const project = await SBDL.downloadProjectFromID('140947879');
  expect(project.type).toBe('sb3');
  expect(project.title).toBe('Insertion Sort');
}, 30000);

test('get legacy from ID', async () => {
  const project = await SBDL.downloadLegacyProjectFromID('140947879');
  expect(project.type).toBe('sb2');
  expect(project.title).toBe('Insertion Sort');
}, 30000);

test('download unshared project', async () => {
  // NOTE: This test is expected to eventually break when Scratch finishes their API changes
  await SBDL.downloadProjectFromID('721028192');
}, 30000);

test('get metadata for shared project', async () => {
  const metadata = await SBDL.getProjectMetadata('437419376');
  expect(metadata.title).toBe('Bouncing');
  expect(metadata.id).toBe(437419376);
  expect(metadata.author.username).toBe('TestMuffin');
  expect(metadata.project_token).toMatch(/^\d+_[a-f0-9]{40}$/i);
}, 30000);

test('get metadata for unshared project', async () => {
  try {
    await SBDL.getProjectMetadata('721028192');
    expect.fail();
  } catch (e) {
    expect(e.name, 'CanNotAccessProjectError');
  }
}, 30000);
