import {expect, test} from 'vitest';
import * as SBDL from '../src/export-node.js';
import {arrayBufferSerializer} from './test-utilities';

expect.addSnapshotSerializer(arrayBufferSerializer);

test('progress events received in correct order', async () => {
  const allEvents = [];
  const startedEventTypes = [];
  const finishedEventTypes = [];
  const onProgress = (type, loaded, total) => {
    allEvents.push([type, loaded, total]);

    if (loaded === total) {
      expect(startedEventTypes.includes(type)).toBe(true);
      if (finishedEventTypes[finishedEventTypes.length - 1] !== type) {
        finishedEventTypes.push(type);
      }
    }

    if (loaded === 0) {
      startedEventTypes.push(type);
    }
  };

  // Need to use any arbitrary shared project here, preferably a small one.
  const project = await SBDL.downloadProjectFromID('437419376', {
    onProgress
  });

  expect(startedEventTypes).toStrictEqual(finishedEventTypes);
  expect(startedEventTypes).toStrictEqual([
    'metadata',
    'project',
    'assets',
    'compress'
  ]);

  expect(allEvents.filter(i => i[0] === 'metadata')).toStrictEqual([
    ['metadata', 0, 1],
    ['metadata', 1, 1],
  ]);
  expect(allEvents.filter(i => i[0] === 'project')).toStrictEqual([
    ['project', 0, 1],
    ['project', 1, 1],
    ['project', 1, 1],
  ]);
  expect(allEvents.filter(i => i[0] === 'assets')).toStrictEqual([
    ['assets', 0, 5],
    ['assets', 1, 5],
    ['assets', 2, 5],
    ['assets', 3, 5],
    ['assets', 4, 5],
    ['assets', 5, 5],
  ]);

  expect(project).toMatchSnapshot();
}, 30000);
