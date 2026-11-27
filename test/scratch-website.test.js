import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as SBDL from '../src/export-node.js';

test('get latest from ID', {timeout: 30000}, async () => {
  const project = await SBDL.downloadProjectFromID('140947879');
  assert.equal(project.type, 'sb3');
  assert.equal(project.title, 'Insertion Sort');
});

test('get metadata for shared project', {timeout: 30000}, async () => {
  const metadata = await SBDL.getProjectMetadata('437419376');
  assert.equal(metadata.title, 'Bouncing');
  assert.equal(metadata.id, 437419376);
  assert.equal(metadata.author.username, 'TestMuffin');
  assert.equal(typeof metadata.project_token, 'string');
});

test('get metadata for unshared project', {timeout: 30000}, async () => {
  await assert.rejects(SBDL.getProjectMetadata('721028192'), {
    name: 'CanNotAccessProjectError'
  });
});
