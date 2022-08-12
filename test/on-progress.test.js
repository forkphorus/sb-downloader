import {expect, test} from 'vitest';
import * as SBDL from '../src/export-node.js';
import {arrayBufferSerializer} from './test-utilities';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('progress events received in correct order', async () => {
  const startedEvents = new Set();
  const finishedEvents = new Set();
  const onProgress = (type, loaded, total) => {
    const progress = loaded / total;
    if (progress === 0) {
      startedEvents.add(type);
    } else {
      expect(startedEvents.has(type)).toBe(true);
      if (progress === 1) {
        finishedEvents.add(type);
      }
    }
  };
  // Need to use any arbitrary shared project here, preferably a small one.
  const project = await SBDL.downloadProjectFromID('437419376', {
    onProgress
  });
  expect(startedEvents).toStrictEqual(finishedEvents);
  expect(startedEvents).toStrictEqual(new Set(['metadata', 'project', 'assets', 'compress']));
  expect(project).toMatchSnapshot();
}, 30000);
