import {test} from 'node:test';
import fs from 'node:fs';
import * as SBDL from '../src/export-node.js';
import {getFixturePath} from './test-utilities.js';

test('option to disable compression', async (t) => {
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb3.json')), {
    compress: false
  });
  t.assert.snapshot(project);
});
