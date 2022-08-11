import {expect, test} from 'vitest';
import fs from 'fs';
import * as SBDL from '../src/export-node.js';
import {getFixturePath, arrayBufferSerializer} from './test-utilities';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('option to disable compression', async () => {
  const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('minimal-sb3.json')), {
    compress: false
  });
  expect(project).toMatchSnapshot();
});
