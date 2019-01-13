'use strict';

// The loader module of the project.
// Implements all loading and archiving logic. Does not implement UI stuff.

window.loader = (function() {
  'use strict';

  // Customizable hooks that can be overridden by other scripts to measure progress.
  const progressHooks = {
    // Indicates a loader has just started
    start() {},
    // Indicates a new task has started (could be anything like a fetch)
    newTask() {},
    // Indicates a task has finished
    finishTask() {},
  };

  // Loads a scratch 3 project
  function loadScratch3Project(id) {
    const PROJECTS_API = 'https://projects.scratch.mit.edu/$id';
    const ASSETS_API = 'https://assets.scratch.mit.edu/internalapi/asset/$path/get/';

    const result = {
      title: id.toString(),
      extension: 'sb3',
      files: [],
    };

    function addFile(data) {
      progressHooks.newTask();
      const path = data.md5ext;
      return fetch(ASSETS_API.replace('$path', path))
        .then((request) => request.arrayBuffer())
        .then((buffer) => {
          result.files.push({path: data.md5ext, data: buffer});
          progressHooks.finishTask();
        });
    }

    // Removes assets with the same ID
    function dedupeAssets(assets) {
      const result = [];
      const knownIds = new Set();

      for (const i of assets) {
        const id = i.assetId;
        if (knownIds.has(id)) {
          continue;
        }
        knownIds.add(id);
        result.push(i);
      }

      return result;
    }

    progressHooks.start();
    progressHooks.newTask();

    return fetch(PROJECTS_API.replace('$id', id))
      .then((request) => request.json())
      .then((projectData) => {
        result.files.push({path: 'project.json', data: JSON.stringify(projectData)});

        if (!Array.isArray(projectData.targets)) {
          throw new Error('invalid sb3 project (missing targets)');
        }

        const targets = projectData.targets;
        const costumes = [].concat.apply([], targets.map((t) => t.costumes || []));
        const sounds = [].concat.apply([], targets.map((t) => t.sounds || []));
        const assets = dedupeAssets([].concat.apply([], [costumes, sounds]));

        return Promise.all(assets.map((a) => addFile(a)));
      })
      .then(() => {
        progressHooks.finishTask();
        return result;
      });
  }

  // Loads a scratch 2 project
  function loadScratch2Project(id) {
    const PROJECTS_API = 'https://projects.scratch.mit.edu/internalapi/project/$id/get/';
    const ASSETS_API = 'https://cdn.assets.scratch.mit.edu/internalapi/asset/$path/get/';

    const IMAGE_EXTENSIONS = [
      'svg', 'png',
    ];
    const SOUND_EXTENSIONS = [
      'wav',
    ];

    const result = {
      title: id.toString(),
      extension: 'sb2',
      files: [],
    };

    // sb2 files have two ways of storing references to files.
    // In the online editor they use md5 hashes which point to an API destination.
    // In the offline editor they use separate accumlative file IDs for images and sounds.
    // The files served from the Scratch API don't contain the file IDs we need to export a valid .sb2, so we must create those ourselves.

    let soundAccumulator = 0;
    let imageAccumulator = 0;
    let projectData = null;

    // Gets the md5 and extension of an object.
    function md5Of(thing) {
      return thing.md5 || thing.baseLayerMD5 || thing.penLayerMD5 || thing.toString();
    }

    function claimAccumlatedID(extension) {
      if (IMAGE_EXTENSIONS.includes(extension)) {
        return imageAccumulator++;
      } else if (SOUND_EXTENSIONS.includes(extension)) {
        return soundAccumulator++;
      } else {
        throw new Error('unknown extension: ' + extension);
      }
    }

    function addFile(data) {
      progressHooks.newTask();

      const md5 = md5Of(data);
      const extension = md5.split('.').pop();
      const accumlator = claimAccumlatedID(extension);
      const path = accumlator + '.' + extension;

      if ('baseLayerID' in data) {
        data.baseLayerID = accumlator;
      }
      if ('soundID' in data) {
        data.soundID = accumlator;
      }
      if ('penLayerID' in data) {
        data.penLayerID = accumlator;
      }

      return fetch(ASSETS_API.replace('$path', md5))
        .then((request) => request.arrayBuffer())
        .then((buffer) => {
          result.files.push({path: path, data: buffer});
          progressHooks.finishTask();
        });
    }

    progressHooks.start();
    progressHooks.newTask();

    return fetch(PROJECTS_API.replace('$id', id))
      .then((request) => request.json())
      .then((pd) => {
        projectData = pd;
        const children = projectData.children.filter((c) => !c.listName && !c.target);
        const targets = [].concat.apply([], [projectData, children]);
        const costumes = [].concat.apply([], targets.map((c) => c.costumes || []));
        const sounds = [].concat.apply([], targets.map((c) => c.sounds || []));
        const assets = [].concat.apply([], [costumes, sounds, projectData]);
        return Promise.all(assets.map((a) => addFile(a)));
      })
      .then(() => {
        // We must add the project JSON at the end because it may have been changed during the loading.
        result.files.push({path: 'project.json', data: JSON.stringify(projectData)});
        progressHooks.finishTask();
        return result;
      });
  }

  // Creates an archive of files
  function createArchive(files) {
    const zip = new JSZip();
    for (const file of files) {
      const path = file.path;
      const data = file.data;
      zip.file(path, data);
    }
    return zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
    });
  }

  // Loads a project, automatically choses the loader
  function loadProject(id, type) {
    const loaders = {
      "sb2": loader.loadScratch2Project,
      "sb3": loader.loadScratch3Project,
    };
    let result = null;
    type = type.toString();
    if (!(type in loaders)) {
      return Promise.reject('Unknown type');
    }
    return loaders[type](id);
  }

  return {
    loadScratch2Project: loadScratch2Project,
    loadScratch3Project: loadScratch3Project,
    loadProject: loadProject,
    createArchive: createArchive,
    progressHooks: progressHooks,
  };
}());
