import JSZip from 'jszip';
import fetch from 'cross-fetch';
import * as ExtendedJSON from '@turbowarp/json';
import {AbortError, CanNotAccessProjectError, HTTPError} from './errors.js';
import fetchAsArrayBuffer from './safer-fetch.js';
import fetchAsArrayBufferWithProgress from './fetch-with-progress.js';
import environment from './environment.js';

/**
 * @typedef {'sb'|'sb2'|'sb3'} ProjectType
 */

/**
 * @typedef DownloadedProject
 * @property {string} title
 * @property {ProjectType} type
 * @property {ArrayBuffer} arrayBuffer
 */

/**
 * @typedef Options
 * @property {(type: 'project' | 'assets' | 'compress', loaded: number, total: number) => void} [onProgress] Called periodically with progress updates.
 * @property {Date} [date] The date to use for the "last modified" time in generated projects. If not set, defaults to an arbitrary date in the past.
 * @property {boolean} [compress] Whether to compress generated projects or not. Compressed projects take longer to generate but are much smaller. Defaults to true.
 * @property {AbortSignal} [signal] An AbortSignal that can be used to cancel the download.
 * @property {string} [assetHost] The URL from which to download assets from. $id is replaced with the asset ID (md5ext).
 * @property {(type: ProjectType, data: unknown) => unknown | Promise<unknown>} [processJSON] Called during the download to access project.json. Return an object to replace project.json.
 */

/**
 * @param {Options} givenOptions
 * @returns {Options}
 */
const parseOptions = (givenOptions) => Object.assign({
  // Default asset host for scratch.mit.edu
  assetHost: 'https://assets.scratch.mit.edu/internalapi/asset/$id/get/'
}, givenOptions || {});

/**
 * @param {Options} options
 */
const throwIfAborted = (options) => {
  // Browser support for AbortSignal.prototype.throwIfAborted() is not good.
  if (options.signal && options.signal.aborted) {
    throw new AbortError();
  }
};

/**
 * @param {Options} options
 */
const makeAssetProgressTarget = (options) => {
  let totalAssets = 0;
  let loadedAssets = 0;
  let timeout = null;
  let isDone = false;

  const emitProgressUpdate = () => {
    throwIfAborted(options);

    if (isDone) {
      throw new Error('Asset progress target used after completion');
    } else if (totalAssets === loadedAssets) {
      // When we're done, don't wait for the timeout as by the time that finishes,
      // some other event may have been emitted and we would then overwrite it and
      // be out of order.
      isDone = true;
      if (options.onProgress) {
        options.onProgress('assets', loadedAssets, totalAssets);
      }
      clearTimeout(timeout);
      timeout = null;
    } else if (!timeout) {
      timeout = setTimeout(() => {
        throwIfAborted(options);
        timeout = null;
        if (options.onProgress) {
          options.onProgress('assets', loadedAssets, totalAssets);
        }
      });
    }
  };

  return {
    fetching: () => {
      totalAssets++;
      emitProgressUpdate();
    },
    fetched: () => {
      loadedAssets++;
      emitProgressUpdate();
    }
  };
};

/**
 * @param {JSZip} zip
 * @param {ProjectType} type
 * @param {SB2Project|SB3Project} projectData
 * @param {Options} options
 * @returns {Promise<boolean>} True if the zip was modified
 */
const storeProjectJSON = async (zip, type, projectData, options) => {
  if (options.processJSON) {
    const newData = await options.processJSON(type, projectData);
    throwIfAborted(options);

    if (newData) {
      zip.file('project.json', ExtendedJSON.stringify(newData));
      return true;
    }
  }

  // If project.json is already in the zip, don't overwrite it as that would lose
  // possibly interesting data from sb2 projects with comments in the JSON.
  if (!zip.file('project.json')) {
    zip.file('project.json', ExtendedJSON.stringify(projectData));
    return true;
  }

  return false;
};

const isAbortError = (error) => error && error.name === 'AbortError';

/**
 * Browser support for Array.prototype.flat is not to the level we want.
 * @template T
 * @param {T[][]} array
 * @returns {T[]}
 */
const flat = (array) => {
  const result = [];
  for (const i of array) {
    if (Array.isArray(i)) {
      for (const j of i) {
        result.push(j);
      }
    } else {
      result.push(i);
    }
  }
  return result;
};

/**
 * @param {Uint8Array} uint8array
 * @returns {boolean}
 */
const isScratch1Project = (uint8array) => {
  const MAGIC = 'ScratchV';
  for (let i = 0; i < MAGIC.length; i++) {
    if (uint8array[i] !== MAGIC.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

/**
 * @param {Uint8Array} uint8array
 * @returns {boolean}
 */
const isProbablyJSON = (uint8array) => uint8array[0] === '{'.charCodeAt(0);

/**
 * @typedef SB2Project
 * @property {SB2Costume[]} costumes
 * @property {SB2Sound[]} sounds
 * @property {Array<SB2ListMonitor | SB2VariableMonitor | SB2Sprite>} children
 */

/**
 * @typedef SB2ListMonitor
 * @property {string} listName
 */

/**
 * @typedef SB2VariableMonitor
 * @property {string} target
 */

/**
 * @typedef SB2Sprite
 * @property {SB2Costume[]} costumes
 * @property {SB2Sound[]} sounds
 */

/**
 * @typedef SB2Costume
 * @property {string} costumeName
 * @property {number} baseLayerID
 * @property {string} baseLayerMD5
 * @property {number} bitmapResolution
 * @property {number} rotationCenterX
 * @property {number} rotationCenterY
 */

/**
 * @typedef SB2Sound
 * @property {string} soundName
 * @property {number} soundID
 * @property {string} md5
 * @property {number} sampleCount
 * @property {number} rate
 * @property {string} format
 */

/**
 * @param {SB2Project} projectData
 * @param {JSZip|null} zip
 * @param {Options} options
 * @returns {Promise<{zip: JSZip; downloadedAssets: number; modifiedJSON: boolean;}>}
 */
const downloadScratch2 = async (projectData, zip, options) => {
  const progressTarget = makeAssetProgressTarget(options);
  zip = zip || new JSZip();

  // sb2 files have two ways of storing references to files.
  // In the online editor they use md5 hashes ("md5ext" because they also have an extension).
  // In the offline editor they use separate integer file IDs for images and sounds.
  // We need the sb2 to use those integer file IDs, but the ones from the Scratch API don't have those, so we create them ourselves

  const getExtension = (md5ext) => md5ext.split('.')[1] || '';

  /**
   * @param {string} md5ext
   * @param {number} id
   * @returns {Promise<{path: string, data: ArrayBuffer}>}
   */
  const fetchAndStoreAsset = async (md5ext, id) => {
    progressTarget.fetching(md5ext);
    // assetHost will never be undefined here because of parseOptions()
    const arrayBuffer = await fetchAsArrayBuffer(options.assetHost.replace('$id', md5ext), {
      headers: environment.headers
    });
    const path = `${id}.${getExtension(md5ext)}`;
    progressTarget.fetched(md5ext);
    return {
      path,
      data: arrayBuffer
    };
  };

  /**
   * @param {SB2Costume[]} costumes
   * @param {SB2Sound[]} sounds
   * @returns {Promise<{path: string, data: ArrayBuffer}[]>}
   */
  const downloadAssets = (costumes, sounds) => {
    const md5extToId = new Map();
    const needToFetch = [];

    // First pass: see which assets are already in the zip, as that determines
    // which asset IDs we can use for fetched assets

    let largestCostumeId = -1;
    for (const costume of costumes) {
      const baseLayerExtension = getExtension(costume.baseLayerMD5) || 'png';
      if (costume.baseLayerID >= 0 && zip.file(`${costume.baseLayerID}.${baseLayerExtension}`)) {
        md5extToId.set(costume.baseLayerMD5, costume.baseLayerID);
        largestCostumeId = Math.max(largestCostumeId, costume.baseLayerID);
      }

      if (costume.textLayerMD5) {
        if (costume.textLayerID >= 0 && zip.file(`${costume.textLayerID}.png`)) {
          md5extToId.set(costume.textLayerMD5, costume.textLayerID);
          largestCostumeId = Math.max(largestCostumeId, costume.textLayerID);
        }
      }
    }

    let largestSoundId = -1;
    for (const sound of sounds) {
      if (sound.soundID >= 0 && zip.file(`${sound.soundID}.${getExtension(sound.md5)}`)) {
        md5extToId.set(sound.md5, sound.soundID);
        largestSoundId = Math.max(largestSoundId, sound.soundID);
      }
    }

    // Second pass: assign new IDs to all unknown assets

    let costumeAccumulator = largestCostumeId === -1 ? 0 : largestCostumeId + 1;
    let soundAccumulator = largestSoundId === -1 ? 0 : largestSoundId + 1;
    const assignCostumeId = (md5ext) => {
      if (!md5extToId.has(md5ext)) {
        needToFetch.push(md5ext);
        md5extToId.set(md5ext, costumeAccumulator);
        costumeAccumulator++;
      }
      return md5extToId.get(md5ext);
    };
    const assignSoundId = (md5ext) => {
      if (!md5extToId.has(md5ext)) {
        needToFetch.push(md5ext);
        md5extToId.set(md5ext, soundAccumulator);
        soundAccumulator++;
      }
      return md5extToId.get(md5ext);
    };

    for (const costume of costumes) {
      costume.baseLayerID = assignCostumeId(costume.baseLayerMD5);
      if (costume.textLayerMD5) {
        costume.textLayerID = assignCostumeId(costume.textLayerMD5);
      }
    }

    for (const sound of sounds) {
      sound.soundID = assignSoundId(sound.md5);
    }

    // Now we know what to download and where to store it.
    return Promise.all(needToFetch.map(md5ext => fetchAndStoreAsset(md5ext, md5extToId.get(md5ext))));
  };

  /** @type {SB2Sprite[]} */
  const targets = [
    projectData,
    ...projectData.children.filter((c) => !c.listName && !c.target)
  ];
  const costumes = flat(targets.map((i) => i.costumes || []));
  const sounds = flat(targets.map((i) => i.sounds || []));
  const filesToAdd = await downloadAssets(costumes, sounds);

  // Project JSON is mutated during loading, so add it at the end.
  const modifiedJSON = await storeProjectJSON(zip, 'sb2', projectData, options);

  // Add files to the zip at the end so the order will be consistent.
  for (const {path, data} of filesToAdd) {
    zip.file(path, data);
  }

  return {
    downloadedAssets: filesToAdd.length,
    modifiedJSON: modifiedJSON,
    zip
  };
};

/**
 * @typedef SB3Project
 * @property {SB3Target[]} targets
 */

/**
 * @typedef SB3Target
 * @property {SB3Asset[]} sounds
 * @property {SB3Asset[]} costumes
 */

/**
 * @typedef SB3Asset Raw costume or sound data from an sb3 project.json.
 * @property {string} assetId md5 checksum of the asset (eg. b7b7898cfcd9ba13e89a4e74dd56a1ff)
 * @property {string} dataFormat file extension of the asset (eg. svg, wav)
 * @property {string|undefined} md5ext dataFormat (eg. b7b7898cfcd9ba13e89a4e74dd56a1ff.svg)
 * md5ext is not guaranteed to exist.
 * There are additional properties that we don't care about.
 */

/**
 * @param {SB3Project} projectData
 * @param {JSZip|null} zip
 * @param {Options} options
 * @returns {Promise<{zip: JSZip; downloadedAssets: number; modifiedJSON: boolean;}>}
 */
const downloadScratch3 = async (projectData, zip, options) => {
  const progressTarget = makeAssetProgressTarget(options);
  zip = zip || new JSZip();

  /**
   * @param {SB3Asset[]} assets
   * @returns {string[]}
   */
  const prepareAssets = (assets) => {
    const knownMd5exts = new Set();
    const missing = [];

    for (const asset of assets) {
      // There are some projects with assets with the same assetId but different extension,
      // we need to include each of those so we use md5ext instead of asset id, eg.
      // https://scratch.mit.edu/projects/531881458

      // md5ext may not exist, eg. the "Cake" costume of https://projects.scratch.mit.edu/630358355
      // https://github.com/forkphorus/forkphorus/issues/504
      const md5ext = asset.md5ext || `${asset.assetId}.${asset.dataFormat}`;

      // Deduplicate assets to avoid unnecessary requests.
      if (knownMd5exts.has(md5ext)) {
        continue;
      }

      // Don't download assets that are already in the zip
      if (zip.file(md5ext)) {
        continue;
      }

      knownMd5exts.add(md5ext);
      missing.push(md5ext);
    }

    return missing;
  };

  /**
   * @param {string} md5ext
   * @returns {Promise<void>}
   */
  const addFile = async (md5ext) => {
    progressTarget.fetching(md5ext);

    // assetHost will never be undefined here because of parseOptions()
    const buffer = await fetchAsArrayBuffer(options.assetHost.replace('$id', md5ext), {
      signal: options.signal,
      headers: environment.headers
    });

    progressTarget.fetched(md5ext);
    return {
      path: md5ext,
      data: buffer
    };
  };

  const targets = projectData.targets;
  const costumes = flat(targets.map((t) => t.costumes || []));
  const sounds = flat(targets.map((t) => t.sounds || []));
  const assets = prepareAssets([...costumes, ...sounds]);
  const filesToAdd = await Promise.all(assets.map(addFile));

  const modifiedJSON = await storeProjectJSON(zip, 'sb3', projectData, options);

  // Add files to the zip at the end so the order will be consistent.
  for (const {path, data} of filesToAdd) {
    zip.file(path, data);
  }

  return {
    zip,
    modifiedJSON,
    downloadedAssets: filesToAdd.length
  };
};

/**
 * @param {unknown} projectData
 * @returns {'sb2'|'sb3'|null}
 */
const identifyProjectTypeFromJSON = (projectData) => {
  if (Object.prototype.hasOwnProperty.call(projectData, 'targets')) {
    return 'sb3';
  } else if (Object.prototype.hasOwnProperty.call(projectData, 'objName')) {
    return 'sb2';
  }
  return null;
};

/**
 * @param {JSZip} zip
 * @param {Options} options
 * @returns {Promise<ArrayBuffer>}
 */
const generateZip = (zip, options) => {
  const date = options.date || new Date('Fri, 31 Dec 2021 00:00:00 GMT');
  for (const file of Object.values(zip.files)) {
    file.date = date;
  }
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: options.compress !== false ? 'DEFLATE' : 'STORE'
  }, (meta) => {
    if (options.onProgress) {
      options.onProgress('compress', meta.percent / 100, 1);
    }
  });
};

/**
 * @param {object} projectData Parsed project.json or stringified JSON.
 * @param {Options} [options]
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromJSON = async (projectData, options) => {
  options = parseOptions(options);

  if (typeof projectData === 'string') {
    projectData = ExtendedJSON.parse(projectData);
  }

  const type = identifyProjectTypeFromJSON(projectData);

  /** @type {JSZip} */
  let downloadedZip;
  if (type === 'sb3') {
    downloadedZip = (await downloadScratch3(projectData, null, options)).zip;
  } else if (type === 'sb2') {
    downloadedZip = (await downloadScratch2(projectData, null, options)).zip;
  } else {
    throw new Error(`Unknown project type: ${type}`);
  }

  throwIfAborted(options);

  const zippedProject = await generateZip(downloadedZip, options);
  throwIfAborted(options);

  return {
    title: '',
    type,
    arrayBuffer: zippedProject
  };
};

/**
 * @param {ArrayBuffer | ArrayBufferView} data Data of compressed project or project.json
 * @param {Options} [options]
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromBuffer = async (data, options) => {
  options = parseOptions(options);

  throwIfAborted(options);

  if (ArrayBuffer.isView(data)) {
    data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  const uint8array = new Uint8Array(data);

  if (isProbablyJSON(uint8array)) {
    // JSON project. We must download the assets.
    const text = new TextDecoder().decode(data);
    return downloadProjectFromJSON(text, options);
  }

  if (isScratch1Project(uint8array)) {
    // Scratch 1 project. Return as-is.
    return {
      title: '',
      type: 'sb',
      arrayBuffer: data,
    };
  }

  // Compressed project. Need to unzip to figure out what type it is.
  let zip;
  let needToReZip = !!options.date;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (e) {
    throw new Error('Cannot parse project: not a zip or sb');
  }

  throwIfAborted(options);

  // Copy all files in subdirectories to the root. This makes logic much simpler later on
  // when we download assets or process JSON and ensures that makes our outputs more
  // "normalized".
  for (const oldPath of Object.keys(zip.files)) {
    if (oldPath.endsWith('/') || !oldPath.includes('/')) {
      continue;
    }

    // Array.prototype.at(-1) support is not good enough
    const parts = oldPath.split('/');
    const newPath = parts[parts.length - 1];

    if (zip.file(newPath)) {
      throw new Error(`Path conflict ${oldPath}`);
    }

    zip.file(newPath, await zip.file(oldPath).async('uint8array'));
    zip.remove(oldPath);
    needToReZip = true;

    throwIfAborted(options);
  }

  // Remove the now-empty subdirectories themselves
  for (const path of Object.keys(zip.files)) {
    if (path.includes('/')) {
      zip.remove(path);
    }
  }

  const projectDataFile = zip.file('project.json');
  if (!projectDataFile) {
    throw new Error('project.json is missing');
  }

  const projectDataText = await projectDataFile.async('text');
  const projectData = ExtendedJSON.parse(projectDataText);
  const type = identifyProjectTypeFromJSON(projectData);

  throwIfAborted(options);

  if (type === 'sb3') {
    const result = await downloadScratch3(projectData, zip, options);
    if (result.downloadedAssets > 0 || result.modifiedJSON) {
      needToReZip = true;
    }
  } else if (type === 'sb2') {
    const result = await downloadScratch2(projectData, zip, options);
    if (result.downloadedAssets > 0 || result.modifiedJSON) {
      needToReZip = true;
    }
  } else {
    throw new Error(`Unknown project type: ${type}`);
  }

  throwIfAborted(options);

  if (needToReZip) {
    data = await generateZip(zip, options);
    throwIfAborted(options);
  }

  return {
    title: '',
    type,
    arrayBuffer: data
  };
};

/**
 * @typedef ProjectMetadata
 * @property {number} id
 * @property {string} title
 * @property {string} description
 * @property {string} instructions
 * @property {string} visibility
 * @property {boolean} public
 * @property {boolean} comments_allowed
 * @property {boolean} is_published
 * @property {object} author
 * @property {number} author.id
 * @property {string} author.username
 * @property {boolean} author.scratchteam
 * @property {object} author.history
 * @property {string} author.history.joined
 * @property {object} author.profile
 * @property {null} author.profile.id
 * @property {Record<'90x90' | '60x60' | '55x55' | '50x50' | '32x32', string>} author.profile.images
 * @property {string} image
 * @property {Record<'282x218' | '216x163' | '200x200' | '144x108' | '135x102' | '100x80', string>} images
 * @property {object} history
 * @property {string} history.created
 * @property {string} history.modified
 * @property {string} history.shared
 * @property {object} stats
 * @property {number} stats.views
 * @property {number} stats.loves
 * @property {number} stats.favorites
 * @property {number} stats.remixes
 * @property {object} remix
 * @property {number|null} remix.parent
 * @property {number|null} remix.root
 * @property {string} project_token
 */

/**
 * @param {string} id
 * @param {Options} [options]
 * @returns {Promise<ProjectMetadata>}
 */
export const getProjectMetadata = async (id, options) => {
  options = parseOptions(options);
  const urls = (
    environment.canAccessScratchAPI ?
    [
      `https://api.scratch.mit.edu/projects/${id}`
    ] :
    [
      `https://trampoline.turbowarp.org/api/projects/${id}`,
      `https://trampoline.turbowarp.xyz/api/projects/${id}`,
    ]
  );
  let firstError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        signal: options.signal,
        headers: environment.headers
      });
      if (response.status === 404) {
        throw new CanNotAccessProjectError(`${id} is unshared or does not exist`);
      }
      if (!response.ok) {
        throw new HTTPError(url, response.status);
      }
      const json = await response.json();
      return json;
    } catch (e) {
      if (e instanceof CanNotAccessProjectError || isAbortError(e)) {
        throw e;
      } else {
        firstError = e;
      }
    }
  }
  throw firstError;
};

/**
 * @param {string} url
 * @returns {string}
 */
const getProjectTitleFromURL = (url) => {
  const match = url.match(/\/([^\/]+)\.sb[2|3]?$/);
  if (match) {
    return match[1];
  }
  return '';
};

/**
 * @param {string} url
 * @param {Options} [options]
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromURL = async (url, options) => {
  options = parseOptions(options);
  let buffer;
  try {
    buffer = await fetchAsArrayBufferWithProgress(url, (progress) => {
      if (options.onProgress) {
        options.onProgress('project', progress, 1);
      }
    }, options.signal);
  } catch (e) {
    if (e instanceof HTTPError && e.status === 404) {
      throw new CanNotAccessProjectError(e.message);
    }
    throw e;
  }
  const project = await downloadProjectFromBuffer(buffer, options);
  project.title = getProjectTitleFromURL(url);
  return project;
};

/**
 * @param {string} id
 * @param {string} baseUrl
 * @param {Options} options
 * @returns {Promise<DownloadedProject>}
 */
const downloadFromScratchURLWithToken = async (id, baseUrl, options) => {
  options = parseOptions(options);
  if (options.onProgress) {
    options.onProgress('metadata', 0, 1);
  }
  const meta = await getProjectMetadata(id, options);
  if (options.onProgress) {
    options.onProgress('metadata', 1, 1);
  }
  throwIfAborted(options);
  const token = meta.project_token;
  const title = meta.title;
  const tokenPart = token ? `?token=${token}` : '';
  const fullUrl = baseUrl + tokenPart;
  const project = await downloadProjectFromURL(fullUrl, options);
  if (title) {
    project.title = title;
  }
  return project;
};

/**
 * @param {string} id
 * @param {Options} [options]
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromID = (id, options) => downloadFromScratchURLWithToken(
  id,
  `https://projects.scratch.mit.edu/${id}`,
  options
);
