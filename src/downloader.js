import JSZip from 'jszip';
import fetch from 'cross-fetch';
import {CannotAccessProjectError, HTTPError} from './errors';
import fetchAsArrayBuffer from './safer-fetch';
import fetchAsArrayBufferWithProgress from './fetch-with-progress';

const ASSET_HOST = 'https://assets.scratch.mit.edu/internalapi/asset/$path/get/';

/**
 * @typedef DownloadedProject
 * @property {string} title
 * @property {'sb'|'sb2'|'sb3'} type
 * @property {ArrayBuffer} arrayBuffer
 */

/**
 * @typedef Options
 * @property {(type: 'project' | 'assets' | 'compress', loaded: number, total: number) => void} [onProgress]
 */

/**
 * @typedef InternalProgressTarget
 * @property {(md5ext: string) => void} fetching
 * @property {(md5ext: string) => void} fetched
 */

/**
 * @returns {Options}
 */
const getDefaultOptions = () => ({});

/**
 * Browser support for Array.prototype.flat is not to the level we want.
 * TODO: do we still care?
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
 * @param {unknown} projectData
 * @param {InternalProgressTarget} progressTarget
 * @returns {Promise<JSZip>}
 */
const downloadScratch2 = (projectData, progressTarget) => {
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
    return fetchAsArrayBuffer(ASSET_HOST.replace('$path', md5ext))
      .then((arrayBuffer) => {
        const path = `${id}.${getExtension(md5ext)}`;
        zip.file(path, arrayBuffer);
        progressTarget.fetched(md5ext);
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
    .then(() => {
      // Project JSON is mutated during loading, so add it at the e nd.
      zip.file('project.json', JSON.stringify(projectData));
      return zip;
    });
};

/**
 * @param {object} projectData
 * @param {InternalProgressTarget} progressTarget
 * @returns {Promise<JSZip>}
 */
const downloadScratch3 = async (projectData, progressTarget) => {
  /**
   * @typedef SB3Asset Raw costume or sound data from an sb3 project.json.
   * @property {string} assetId md5 checksum of the asset (eg. b7b7898cfcd9ba13e89a4e74dd56a1ff)
   * @property {string} dataFormat file extension of the asset (eg. svg, wav)
   * @property {string|undefined} md5ext dataFormat (eg. b7b7898cfcd9ba13e89a4e74dd56a1ff.svg)
   * md5ext is not guaranteed to exist.
   * There are additional properties that we don't care about.
   */

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

    const buffer = await fetchAsArrayBuffer(ASSET_HOST.replace('$path', md5ext));

    zip.file(md5ext, buffer);
    progressTarget.fetched(md5ext);
  };

  zip.file('project.json', JSON.stringify(projectData));

  const targets = projectData.targets;
  const costumes = flat(targets.map((t) => t.costumes || []));
  const sounds = flat(targets.map((t) => t.sounds || []));
  const assets = prepareAssets([...costumes, ...sounds]);
  await Promise.all(assets.map(addFile));

  return zip;
};

/**
 * @param {unknown} projectData
 * @returns {'sb2'|'sb3'|null}
 */
const identifyProjectTypeFromJSON = (projectData) => {
  if ('targets' in projectData) {
    return 'sb3';
  } else if ('objName' in projectData) {
    return 'sb2';
  }
  return null;
};

/**
 * @param {object} json
 * @param {InternalProgressTarget} progressTarget
 * @returns {Promise<JSZip>}
 */
const downloadProjectFromJSON = (json, progressTarget) => {
  const type = identifyProjectTypeFromJSON(json);
  if (type === 'sb3') {
    return downloadScratch3(json, progressTarget);
  } else if (type === 'sb2') {
    return downloadScratch2(json, progressTarget);
  }
  // TODO: better error here
  throw new Error('Unknown project type');
};

/**
 * @param {ArrayBuffer} data
 * @param {Options} options
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromBinaryOrJSON = async (data, options = getDefaultOptions()) => {
  let type;
  let arrayBuffer;

  const generateZip = (zip) => zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE'
  }, (meta) => {
    if (options.onProgress) {
      options.onProgress('compress', meta.percent / 100, 1);
    }
  });

  const bufferView = new Uint8Array(data);
  if (bufferView[0] === '{'.charCodeAt(0)) {
    // JSON project. We must download the assets.

    let isDoneLoadingProject = false;
    let timeout = null;
    let loadedAssets = 0;
    let totalAssets = 0;
    const sendThrottledAssetProgressUpdate = () => {
      if (timeout) {
        return;
      }
      timeout = setTimeout(() => {
        timeout = null;
        if (!isDoneLoadingProject && options.onProgress) {
          options.onProgress('assets', loadedAssets, totalAssets);
        }
      });
    };

    /** @type {InternalProgressTarget} */
    const progressTarget = {
      fetching: () => {
        totalAssets++;
        sendThrottledAssetProgressUpdate();  
      },
      fetched: () => {
        loadedAssets++;
        sendThrottledAssetProgressUpdate();  
      }
    };

    const text = new TextDecoder().decode(data);
    const json = JSON.parse(text);
    type = identifyProjectTypeFromJSON(json);
    const downloadedZip = await downloadProjectFromJSON(json, progressTarget);

    if (options.onProgress) {
      options.onProgress('assets', totalAssets, totalAssets);
    }
    isDoneLoadingProject = true;

    arrayBuffer = await generateZip(downloadedZip);
  } else if (isScratch1Project(bufferView)) {
    arrayBuffer = data;
    type = 'sb';
  } else {
    let zip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch (e) {
      throw new Error('Cannot parse project: not a zip or sb');
    }

    const projectDataFile = zip.file(/^([^/]*\/)?project\.json$/)[0];
    if (!projectDataFile) {
      throw new Error('project.json is missing');
    }

    // TODO: see if this works when project.json not in root
    const projectDataText = await projectDataFile.async('text');
    const projectData = JSON.parse(projectDataText);
    type = identifyProjectTypeFromJSON(projectData);
    arrayBuffer = data;
  }

  return {
    title: '',
    type,
    arrayBuffer
  };
};

/**
 * @typedef ProjectMetadata
 * @property {string} title
 * @property {string} token
 */

/**
 * @param {string} id
 * @returns {Promise<ProjectMetadata>}
 */
export const getProjectMetadata = async (id) => {
  // TODO: in node.js, talk to api.scratch.mit.edu directly
  // TODO: retry with .xyz in case blocked
  const res = await fetch(`https://trampoline.turbowarp.org/proxy/projects/${id}`);
  if (!res.ok) {
    throw new CannotAccessProjectError(id);
  }
  const json = await res.json();
  return json;
};

/**
 * @param {string} url
 * @param {Options} options
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromURL = async (url, options = getDefaultOptions()) => {
  let buffer;
  try {
    buffer = await fetchAsArrayBufferWithProgress(url, (progress) => {
      if (options.onProgress) {
        options('project', progress, 1);
      }
    });
  } catch (e) {
    if (e instanceof HTTPError && e.status === 404) {
      throw new CannotAccessProjectError(e.message);
    }
  }
  return downloadProjectFromBinaryOrJSON(buffer, options);
};

/**
 * @param {string} url
 * @param {Options} options
 * @returns {Promise<DownloadedProject>}
 */
export const downloadProjectFromID = async (id, options = getDefaultOptions()) => {
  let meta;
  try {
    meta = await getProjectMetadata(id);
  } catch (e) {
    // This is okay for now.
    console.warn(e);
  }
  const token = meta && meta.token;
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
 * @param {Options} options
 * @returns {Promise<DownloadedProject>}
 */
export const downloadLegacyProjectFromID = async (id, options = getDefaultOptions()) => {
  const url = `https://projects.scratch.mit.edu/internalapi/project/${id}/get/`;
  return downloadProjectFromURL(url, options);
};