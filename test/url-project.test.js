import {test, expect} from 'vitest';
import * as SBDL from '../src/export-node.js';

test('load project from URL', async () => {
  const project = await SBDL.downloadProjectFromURL('https://packager.turbowarp.org/example.sb3');
  expect(project.title).toBe('example');
}, 30000);
