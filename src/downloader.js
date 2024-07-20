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
const makeProgressTarget = (options) => {
  let totalAssets = 0;
  let loadedAssets = 0;
  let timeout = null;

  const emitProgressUpdate = () => {
    throwIfAborted(options);

    if (!timeout) {
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
 * @param {ProjectType} type
 * @param {unknown} data
 * @param {Options} options
 * @returns {Promise<string>} Promise that resolves to stringified JSON object
 */
const processJSON = async (type, data, options) => {
  if (options.processJSON) {
    const newData = await options.processJSON(type, data);
    if (newData) {
      data = newData;
    }
    throwIfAborted(options);
  }
  return ExtendedJSON.stringify(data);
};

const isAbortError = (error) => error && error.name === 'AbortError';

/**
 * Browser support for Array.prototype.flat is not to the level we want.
 * @param {unknown[]} array
 * @returns {unknown[]}
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
 * @param {unknown} projectData
 * @param {Options} options
 * @returns {Promise<JSZip>}
 */
const downloadScratch2 = async (projectData, options) => {
  const IMAGE_EXTENSIONS = ['svg', 'png', 'jpg', 'gif','bmp'];
  const SOUND_EXTENSIONS = ['wav', 'mp3'];

  const progressTarget = makeProgressTarget(options);
  const zip = new JSZip();

  // sb2 files have two ways of storing references to files.
  // In the online editor they use md5 hashes ("md5ext" because they also have an extension).
  // In the offline editor they use separate integer file IDs for images and sounds.
  // We need the sb2 to use those integer file IDs, but the ones from the Scratch API don't have those, so we create them ourselves

  let soundAccumulator = 0;
  let imageAccumulator = 0;

  const getExtension = (md5ext) => md5ext.split('.')[1] || '';

  const nextId = (md5ext) => {
    const extension = getExtension(md5ext);
    if (IMAGE_EXTENSIONS.includes(extension)) {
      return imageAccumulator++;
    } else if (SOUND_EXTENSIONS.includes(extension)) {
      return soundAccumulator++;
    }
    console.warn('unknown extension: ' + extension);
    return imageAccumulator++;
  };

  const fetchAndStoreAsset = async (md5ext, id) => {
    progressTarget.fetching(md5ext);
    // assetHost will never be undefined here because of parseOptions()
    const arrayBuffer = await fetchAsArrayBuffer(options.assetHost.replace('$id', md5ext))
    const path = `${id}.${getExtension(md5ext)}`;
    progressTarget.fetched(md5ext);
    return {
      path,
      data: arrayBuffer
    };
  };

  const downloadAssets = (costumes, sounds) => {
    const md5extToId = new Map();

    const handleAsset = (md5ext) => {
      if (!md5extToId.has(md5ext)) {
        md5extToId.set(md5ext, nextId(md5ext));
      }
      return md5extToId.get(md5ext);
    };

    for (const costume of costumes) {
      if (costume.baseLayerMD5) {
        costume.baseLayerID = handleAsset(costume.baseLayerMD5);
      }
      if (costume.textLayerMD5) {
        costume.textLayerID = handleAsset(costume.textLayerMD5);
      }
    }
    for (const sound of sounds) {
      if (sound.md5) {
        sound.soundID = handleAsset(sound.md5);
      }
    }

    return Promise.all(Array.from(md5extToId.entries()).map(([md5ext, id]) => fetchAndStoreAsset(md5ext, id)));
  };

  const targets = [
    projectData,
    ...projectData.children.filter((c) => !c.listName && !c.target)
  ];
  const costumes = flat(targets.map((i) => i.costumes || []));
  const sounds = flat(targets.map((i) => i.sounds || []));
  const filesToAdd = await downloadAssets(costumes, sounds);

  // Project JSON is mutated during loading, so add it at the end.
  zip.file('project.json', await processJSON('sb2', projectData, options));

  // Add files to the zip at the end so the order will be consistent.
  for (const {path, data} of filesToAdd) {
    zip.file(path, data);
  }

  return zip;
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
 * @param {Options} options
 * @returns {Promise<JSZip>}
 */
const downloadScratch3 = async (projectData, options) => {
  const progressTarget = makeProgressTarget(options);
  const zip = new JSZip();

  /**
   * @param {SB3Asset[]} assets
   * @returns {SB3Asset[]}
   */
  const prepareAssets = (assets) => {
    const knownMd5exts = new Set();
    const missing = [];

    for (const data of assets) {
      // There are some projects with assets with the same assetId but different extension,
      // we need to include each of those so we use md5ext instead of asset id, eg.
      // https://scratch.mit.edu/projects/531881458

      // md5ext may not exist, eg. the "Cake" costume of https://projects.scratch.mit.edu/630358355
      // https://github.com/forkphorus/forkphorus/issues/504
      const md5ext = data.md5ext || `${data.assetId}.${data.dataFormat}`;

      // Deduplicate assets to avoid unnecessary requests.
      if (knownMd5exts.has(md5ext)) {
        continue;
      }
      knownMd5exts.add(md5ext);
      missing.push(data);
    }

    return missing;
  };

  /**
   * @param {SB3Asset} data
   * @returns {Promise<void>}
   */
  const addFile = async (data) => {
    // prepareAssets will guarantee md5ext exists
    const md5ext = data.md5ext;
    progressTarget.fetching(md5ext);

    // assetHost will never be undefined here because of parseOptions()
    const buffer = await fetchAsArrayBuffer(options.assetHost.replace('$id', md5ext), {
      signal: options.signal
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

  zip.file('project.json', await processJSON('sb3', projectData, options));

  // Add files to the zip at the end so the order will be consistent.
  for (const {path, data} of filesToAdd) {
    zip.file(path, data);
  }

  return zip;
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
    downloadedZip = await downloadScratch3(projectData, options);
  } else if (type === 'sb2') {
    downloadedZip = await downloadScratch2(projectData, options);
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
  try {
    zip = await JSZip.loadAsync(data);
  } catch (e) {
    throw new Error('Cannot parse project: not a zip or sb');
  }

  throwIfAborted(options);

  const projectDataFile = zip.file(/^([^/]*\/)?project\.json$/)[0];
  if (!projectDataFile) {
    throw new Error('project.json is missing');
  }

  const projectDataText = await projectDataFile.async('text');
  const projectData = ExtendedJSON.parse(projectDataText);
  const type = identifyProjectTypeFromJSON(projectData);

  throwIfAborted(options);

  let needToReZip = !!options.date;

  if (options.processJSON) {
    const newJSON = await options.processJSON(type, projectData);
    if (newJSON) {
      needToReZip = true;
      zip.file(projectDataFile.name, ExtendedJSON.stringify(newJSON));
    }
  }

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
        signal: options.signal
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
