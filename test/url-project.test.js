import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as SBDL from '../src/export-node.js';

test('load project from URL', {timeout: 30000}, async () => {
  const project = await SBDL.downloadProjectFromURL('https://packager.turbowarp.org/example.sb3');
  assert.equal(project.title, 'example');
});
