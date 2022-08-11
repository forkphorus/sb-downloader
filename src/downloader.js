import JSZip from 'jszip';
import fetch from 'cross-fetch';
import {AbortError, CannotAccessProjectError, HTTPError} from './errors.js';
import fetchAsArrayBuffer from './safer-fetch.js';
import fetchAsArrayBufferWithProgress from './fetch-with-progress.js';
import environment from './environment.js';

/**
 * @typedef DownloadedProject
 * @property {string} title
 * @property {'sb'|'sb2'|'sb3'} type
 * @property {ArrayBuffer} arrayBuffer
 */

/**
 * @typedef Options
 * @property {(type: 'project' | 'assets' | 'compress', loaded: number, total: number) => void} [onProgress] Called periodically with progress updates.
 * @property {Date} [date] The date to use for the "last modified" time in generated projects. If not set, defaults to an arbitrary date in the past.
 * @property {boolean} [compress] Whether to compress generated projects or not. Compressed projects take longer to generate but are much smaller. Defaults to true.
 * @property {AbortSignal} [signal] An AbortSignal that can be used to cancel the download.
 * @property {string} [assetHost] The URL from which to download assets from. $id is replaced with the asset ID (md5ext).
 */

/**
 * @typedef InternalProgressTarget
 * @property {(md5ext: string) => void} fetching
 * @property {(md5ext: string) => void} fetched
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
 * @param {InternalProgressTarget} progressTarget
 * @returns {Promise<JSZip>}
 */
const downloadScratch2 = (projectData, options, progressTarget) => {
  const IMAGE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'bmp'];
  const SOUND_EXTENSIONS = ['wav', 'mp3'];

  const zip = new JSZip();

  // sb2 files have two ways of storing references to files.
  // In the online editor they use md5 hashes ("md5ext" because they also have an extension).
  // In the offline editor they use separate integer file IDs for images and sounds.
  // We need the sb2 to use those integer file IDs, but the ones from the Scratch API don't have those, so we create them ourselves

  let soundAccumulator = 0;
  let imageAccumulator = 0;

  const getExtension = (md5ext) => md5ext.split('.')[1] || '';

  const nextId = (md5) => {
    const extension = getExtension(md5);
    if (IMAGE_EXTENSIONS.includes(extension)) {
      return imageAccumulator++;
    } else if (SOUND_EXTENSIONS.includes(extension)) {
      return soundAccumulator++;
    }
    console.warn('unknown extension: ' + extension);
    return imageAccumulator++;
  };

  const fetchAndStoreAsset = (md5ext, id) => {
    progressTarget.fetching(md5ext);
    // assetHost will never be undefined here because of parseOptions()
    return fetchAsArrayBuffer(options.assetHost.replace('$id', md5ext))
      .then((arrayBuffer) => {
        const path = `${id}.${getExtension(md5ext)}`;
        progressTarget.fetched(md5ext);
        return {
          path,
          data: arrayBuffer
        };
      });
  };

  const downloadAssets = (assets) => {
    const md5extToId = new Map();

    const handleAsset = (md5ext) => {
      if (!md5extToId.has(md5ext)) {
        md5extToId.set(md5ext, nextId(md5ext));
      }
      return md5extToId.get(md5ext);
    };

    for (const asset of assets) {
      if (asset.md5) {
        asset.soundID = handleAsset(asset.md5);
      }
      if (asset.baseLayerMD5) {
        asset.baseLayerID = handleAsset(asset.baseLayerMD5);
      }
      if (asset.textLayerMD5) {
        asset.textLayerID = handleAsset(asset.textLayerMD5);
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
  return downloadAssets([...costumes, ...sounds])
    .then((filesToAdd) => {
      // Project JSON is mutated during loading, so add it at the end.
      zip.file('project.json', JSON.stringify(projectData));

      // Add files to the zip at the end so the order will be consistent.
      for (const {path, data} of filesToAdd) {
        zip.file(path, data);
      }

      return zip;
    });
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
 * @param {InternalProgressTarget} progressTarget
 * @returns {Promise<JSZip>}
 */
const downloadScratch3 = async (projectData, options, progressTarget) => {
  const zip = new JSZip();

  /**
   * @param {SB3Asset[]} assets
   * @returns {SB3Asset[]}
   */
  const prepareAssets = (assets) => {
    const result = [];
    const knownIds = new Set();

    for (const data of assets) {
      // Make sure md5ext always exists.
      // See the "Cake" costume of https://projects.scratch.mit.edu/630358355 for an example.
      // https://github.com/forkphorus/forkphorus/issues/504
      if (!data.md5ext) {
        data.md5ext = `${data.assetId}.${data.dataFormat}`;
      }

      // Deduplicate assets so we don't make unnecessary requests later.
      // Use md5ext instead of assetId because there are a few projects that have assets with the same
      // assetId but different md5ext. (eg. https://scratch.mit.edu/projects/531881458)
      const md5ext = data.md5ext;
      if (knownIds.has(md5ext)) {
        continue;
      }
      knownIds.add(md5ext);
      result.push(data);
    }

    return result;
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

  zip.file('project.json', JSON.stringify(projectData));

  const targets = projectData.targets;
  const costumes = flat(targets.map((t) => t.costumes || []));
  const sounds = flat(targets.map((t) => t.sounds || []));
  const assets = prepareAssets([...costumes, ...sounds]);
  const filesToAdd = await Promise.all(assets.map(addFile));

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
    projectData = JSON.parse(projectData);
  }

  let isDoneLoadingProject = false;
  let timeout = null;
  let loadedAssets = 0;
  let totalAssets = 0;
  const sendThrottledAssetProgressUpdate = () => {
    if (timeout) {
      return;
    }
    timeout = setTimeout(() => {
      throwIfAborted(options);
      timeout = null;
      if (!isDoneLoadingProject && options.onProgress) {
        options.onProgress('assets', loadedAssets, totalAssets);
      }
    });
  };

  /** @type {InternalProgressTarget} */
  const progressTarget = {
    fetching: () => {
      throwIfAborted(options);
      totalAssets++;
      sendThrottledAssetProgressUpdate();
    },
    fetched: () => {
      throwIfAborted(options);
      loadedAssets++;
      sendThrottledAssetProgressUpdate();
    }
  };

  const type = identifyProjectTypeFromJSON(projectData);

  /** @type {JSZip} */
  let downloadedZip;
  if (type === 'sb3') {
    downloadedZip = await downloadScratch3(projectData, options, progressTarget);
  } else if (type === 'sb2') {
    downloadedZip = await downloadScratch2(projectData, options, progressTarget);
  } else {
    throw new Error(`Unknown project type: ${type}`);
  }

  throwIfAborted(options);

  if (options.onProgress) {
    options.onProgress('assets', totalAssets, totalAssets);
  }
  isDoneLoadingProject = true;

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
    const projectData = JSON.parse(text);
    return downloadProjectFromJSON(projectData, options);
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
  const projectData = JSON.parse(projectDataText);
  const type = identifyProjectTypeFromJSON(projectData);

  throwIfAborted(options);

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
      `https://trampoline.turbowarp.org/proxy/projects/${id}`,
      `https://trampoline.turbowarp.xyz/proxy/projects/${id}`,
    ]
  );
  let firstError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        signal: options.signal
      });
      if (response.status === 404) {
        throw new CannotAccessProjectError(id);
      }
      if (!response.ok) {
        throw new HTTPError(url, response.status);
      }
      const json = await response.json();
      return json;
    } catch (e) {
      if (e instanceof CannotAccessProjectError || isAbortError(e)) {
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
      throw new CannotAccessProjectError(e.message);
    }
    throw e;
  }
  return downloadProjectFromBuffer(buffer, options);
};

/**
 * @param {string} id
 * @param {Options} [options]
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromID = async (id, options) => {
  options = parseOptions(options);
  let meta;
  try {
    meta = await getProjectMetadata(id, options);
  } catch (e) {
    // This is okay for now.
  }
  throwIfAborted(options);
  const token = meta && meta.project_token;
  const title = meta && meta.title;
  const tokenPart = token ? `?token=${token}` : '';
  const url = `https://projects.scratch.mit.edu/${id}${tokenPart}`;
  const project = await downloadProjectFromURL(url, options);
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
export const downloadLegacyProjectFromID = async (id, options) => {
  options = parseOptions(options);
  // Legacy API probably doesn't require token, so we can fetch the metadata in parallel with the project download.
  const url = `https://projects.scratch.mit.edu/internalapi/project/${id}/get/`;
  const [meta, project] = await Promise.all([
    getProjectMetadata(id, options).catch((error) => {
      // Ignore error
      return null;
    }),
    downloadProjectFromURL(url, options),
  ]);
  if (meta && meta.title) {
    project.title = meta.title;
  }
  return project;
};
