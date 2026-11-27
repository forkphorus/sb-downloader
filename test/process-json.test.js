import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from '@turbowarp/jszip';
import * as SBDL from '../src/export-node.js';
import {getFixturePath} from './test-utilities.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('process JSON sb3 without making changes', {timeout: 30000}, async (t) => {
  const processJSON = mock.fn((type, data) => {
    assert.equal(type, 'sb3');
    assert.equal(data.targets[0].name, 'Stage');
  });
  const input = fs.readFileSync(getFixturePath('minimal-sb3.json'), 'utf-8');
  const project = await SBDL.downloadProjectFromJSON(input, {
    processJSON
  });
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.deepEqual(JSON.parse(await zip.file('project.json').async('text')), JSON.parse(input));
});

test('process JSON sb2 without making changes', {timeout: 30000}, async (t) => {
  const processJSON = mock.fn(async (type, data) => {
    assert.equal(type, 'sb2');
    assert.equal(data.objName, 'Stage');
  });
  const input = JSON.parse(fs.readFileSync(getFixturePath('minimal-sb2.json'), 'utf-8'));
  const project = await SBDL.downloadProjectFromJSON(input, {
    processJSON
  });
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
  // we rewrite asset IDs so can't automatically check that the JSON matches the input
  // we'll rely on the snapshot to check
});

test('overwrite JSON sb3', {timeout: 30000}, async (t) => {
  let hasProcessResolved = false;
  const processJSON = mock.fn(async (type, data) => {
    assert.equal(type, 'sb3');
    assert.equal(data.targets[0].name, 'Stage');
    return sleep(100)
      .then(() => {
        hasProcessResolved = true;
        return {
          a: 'b'
        };
      });
  });
  const project = await SBDL.downloadProjectFromJSON(fs.readFileSync(getFixturePath('minimal-sb3.json'), 'utf-8'), {
    processJSON
  });
  assert.equal(processJSON.mock.callCount(), 1);
  assert.equal(hasProcessResolved, true);
  t.assert.snapshot(project);
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(await zip.file('project.json').async('text'), '{"a":"b"}');
});

test('overwrite JSON sb2', {timeout: 30000}, async (t) => {
  let hasProcessResolved = false;
  const processJSON = mock.fn(async (type, data) => {
    assert.equal(type, 'sb2');
    assert.equal(data.objName, 'Stage');
    return sleep(100)
      .then(() => {
        hasProcessResolved = true;
        return {
          c: 'd'
        };
      });
  });
  const project = await SBDL.downloadProjectFromJSON(fs.readFileSync(getFixturePath('minimal-sb2.json'), 'utf-8'), {
    processJSON
  });
  assert.equal(hasProcessResolved, true);
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(await zip.file('project.json').async('text'), '{"c":"d"}');
});

test('process compressed sb3 without making changes', async (t) => {
  const processJSON = mock.fn((type, data) => {
    assert.equal(type, 'sb3');
    assert.equal(data.targets[0].name, 'Stage');
  });
  const input = fs.readFileSync(getFixturePath('167118244.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON,
    onProgress: (type) => {
      assert.notEqual(type, 'compress');
    }
  });
  assert.deepEqual(new Uint8Array(project.arrayBuffer), new Uint8Array(input));
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
});

test('process compressed sb3 with JSON in subdirectory without making changes', async (t) => {
  let compressed = false;
  const processJSON = mock.fn((type, data) => {
    assert.equal(type, 'sb3');
    assert.equal(data.targets[0].name, 'Stage');
  });
  const input = fs.readFileSync(getFixturePath('json-in-subdirectory.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON,
    onProgress: (type) => {
      // Even though we aren't modifying, we expect it to recompress to remove the subdirectory
      if (type === 'compress') {
        compressed = true;
      }
    }
  });
  assert.equal(compressed, true);
  assert.equal(project.type, 'sb3');
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
});

test('process compressed sb2 without making changes', async (t) => {
  const processJSON = mock.fn((type, data) => {
    assert.equal(type, 'sb2');
    assert.equal(data.objName, 'Stage');
  });
  const input = fs.readFileSync(getFixturePath('167118244.sb2'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON,
    onProgress: (type) => {
      assert.notEqual(type, 'compress');
    }
  });
  assert.deepEqual(new Uint8Array(project.arrayBuffer), new Uint8Array(input));
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
});

test('overwrite compressed sb3', async (t) => {
  const processJSON = mock.fn((type, data) => {
    assert.equal(type, 'sb3');
    assert.equal(data.targets[0].name, 'Stage');
    return {
      e: ['f', 'g', 3]
    };
  });
  const input = fs.readFileSync(getFixturePath('167118244.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON
  });
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(await zip.file('project.json').async('text'), '{"e":["f","g",3]}');
});

test('leaves original project data as-is if overwriteJSON returns nothing on JSON sb3', async (t) => {
  const input = fs.readFileSync(getFixturePath('minimal-sb3.json'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    overwriteJSON: () => {}
  });
  t.assert.snapshot(project);
});

test('process and overwrite compressed sb3 with JSON in subdirectory', async (t) => {
  const processJSON = mock.fn(async (type, data) => {
    assert.equal(type, 'sb3');
    assert.equal(data.targets[0].name, 'Stage');
    return {
      h: {
        i: true
      }
    };
  });
  const input = fs.readFileSync(getFixturePath('json-in-subdirectory.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON
  });
  assert.equal(processJSON.mock.callCount(), 1);
  t.assert.snapshot(project);
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  assert.equal(zip.file('this is a subdirectory/project.json'), null);
  assert.equal(await zip.file('project.json').async('text'), '{"h":{"i":true}}');
});

test('process silently ignored on scratch 1', async () => {
  const processJSON = mock.fn();
  await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('scratch1.sb')), {
    processJSON
  });
  assert.equal(processJSON.mock.callCount(), 0);
});
