import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as SBDL from '../src/export-node.js';
import './test-utilities.js';

test('progress events received in correct order', {timeout: 30000}, async (t) => {
  const allEvents = [];
  const startedEventTypes = [];
  const finishedEventTypes = [];
  const onProgress = (type, loaded, total) => {
    allEvents.push([type, loaded, total]);

    if (loaded === total) {
      assert.equal(startedEventTypes.includes(type), true);
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

  assert.deepEqual(startedEventTypes, finishedEventTypes);
  assert.deepEqual(startedEventTypes, [
    'metadata',
    'project',
    'assets',
    'compress'
  ]);

  assert.deepEqual(allEvents.filter(i => i[0] === 'metadata'), [
    ['metadata', 0, 1],
    ['metadata', 1, 1],
  ]);
  assert.deepEqual(allEvents.filter(i => i[0] === 'project'), [
    ['project', 0, 1],
    ['project', 1, 1],
  ]);

  // These are throttled so only first and last events are meant to be reliable
  const assetEvents = allEvents.filter(i => i[0] === 'assets');
  assert.deepEqual(assetEvents[0], ['assets', 0, 5]);
  assert.deepEqual(assetEvents[assetEvents.length - 1], ['assets', 5, 5]);

  t.assert.snapshot(project);
});
