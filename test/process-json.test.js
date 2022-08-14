import {expect, test, vi} from 'vitest';
import fs from 'fs';
import JSZip from 'jszip';
import * as SBDL from '../src/export-node.js';
import {getFixturePath, arrayBufferSerializer} from './test-utilities.js';

expect.addSnapshotSerializer(arrayBufferSerializer);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('process JSON sb3 without making changes', async () => {
  const processJSON = vi.fn((type, data) => {
    expect(type).toBe('sb3');
    expect(data.targets[0].name).toBe('Stage');
  });
  const input = fs.readFileSync(getFixturePath('minimal-sb3.json'), 'utf-8');
  const project = await SBDL.downloadProjectFromJSON(input, {
    processJSON
  });
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(JSON.parse(await zip.file('project.json').async('text'))).toStrictEqual(JSON.parse(input));
}, 30000);

test('process JSON sb2 without making changes', async () => {
  const processJSON = vi.fn(async (type, data) => {
    expect(type).toBe('sb2');
    expect(data.objName).toBe('Stage');
  });
  const input = JSON.parse(fs.readFileSync(getFixturePath('minimal-sb2.json'), 'utf-8'));
  const project = await SBDL.downloadProjectFromJSON(input, {
    processJSON
  });
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
  // we rewrite asset IDs so can't automatically check that the JSON matches the input
  // we'll rely on the snapshot to check
}, 30000);

test('overwrite JSON sb3', async () => {
  let hasProcessResolved = false;
  const processJSON = vi.fn(async (type, data) => {
    expect(type).toBe('sb3');
    expect(data.targets[0].name).toBe('Stage');
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
  expect(processJSON).toHaveBeenCalledOnce();
  expect(hasProcessResolved).toBe(true);
  expect(project).toMatchSnapshot();
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(await zip.file('project.json').async('text')).toBe('{"a":"b"}');
}, 30000);

test('overwrite JSON sb2', async () => {
  let hasProcessResolved = false;
  const processJSON = vi.fn(async (type, data) => {
    expect(type).toBe('sb2');
    expect(data.objName).toBe('Stage');
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
  expect(hasProcessResolved).toBe(true);
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(await zip.file('project.json').async('text')).toBe('{"c":"d"}');
}, 30000);

test('process compressed sb3 without making changes', async () => {
  const processJSON = vi.fn((type, data) => {
    expect(type).toBe('sb3');
    expect(data.targets[0].name).toBe('Stage');
  });
  const input = fs.readFileSync(getFixturePath('167118244.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON,
    onProgress: (type) => {
      expect(type).not.toBe('compress');
    }
  });
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(input));
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
});

test('process compressed sb3 with JSON in subdirectory without making changes', async () => {
  const processJSON = vi.fn((type, data) => {
    expect(type).toBe('sb3');
    expect(data.targets[0].name).toBe('Stage');
  });
  const input = fs.readFileSync(getFixturePath('json-in-subdirectory.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON,
    onProgress: (type) => {
      expect(type).not.toBe('compress');
    }
  });
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(input));
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
});

test('process compressed sb2 without making changes', async () => {
  const processJSON = vi.fn((type, data) => {
    expect(type).toBe('sb2');
    expect(data.objName).toBe('Stage');
  });
  const input = fs.readFileSync(getFixturePath('167118244.sb2'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON,
    onProgress: (type) => {
      expect(type).not.toBe('compress');
    }
  });
  expect(new Uint8Array(project.arrayBuffer)).toStrictEqual(new Uint8Array(input));
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
});

test('overwrite compressed sb3', async () => {
  const processJSON = vi.fn((type, data) => {
    expect(type).toBe('sb3');
    expect(data.targets[0].name).toBe('Stage');
    return {
      e: ['f', 'g', 3]
    };
  });
  const input = fs.readFileSync(getFixturePath('167118244.sb3'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    processJSON
  });
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(await zip.file('project.json').async('text')).toBe('{"e":["f","g",3]}');
});

test('leaves original project data as-is if overwriteJSON returns nothing on JSON sb3', async () => {
  const input = fs.readFileSync(getFixturePath('minimal-sb3.json'));
  const project = await SBDL.downloadProjectFromBuffer(input, {
    overwriteJSON: () => {}
  });
  expect(project).toMatchSnapshot();
});

test('process and overwrite compressed sb3 with JSON in subdirectory', async () => {
  const processJSON = vi.fn(async (type, data) => {
    expect(type).toBe('sb3');
    expect(data.targets[0].name).toBe('Stage');
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
  expect(processJSON).toHaveBeenCalledOnce();
  expect(project).toMatchSnapshot();
  const zip = await JSZip.loadAsync(project.arrayBuffer);
  expect(await zip.file('this is a subdirectory/project.json').async('text')).toBe('{"h":{"i":true}}');
});

test('process silently ignored on scratch 1', async () => {
  const processJSON = vi.fn();
  await SBDL.downloadProjectFromBuffer(fs.readFileSync(getFixturePath('scratch1.sb')), {
    processJSON
  });
  expect(processJSON).toHaveBeenCalledTimes(0);
});
