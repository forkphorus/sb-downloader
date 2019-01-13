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
          result.files.push({path: data.md5ext, data: buffer})
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

    const result = {
      title: id.toString(),
      extension: 'sb2',
      files: [],
    };

    function addFile(data) {
      progressHooks.newTask();
      const path = data.md5 || data.baseLayerMD5;
      return fetch(ASSETS_API.replace('$path', path))
        .then((request) => request.arrayBuffer())
        .then((buffer) => {
          result.files.push({path: path, data: buffer})
          progressHooks.finishTask();
        });
    }

    function dedupeAssets(assets) {
      const result = [];
      const seen = new Set();
      for (const i of assets) {
        const id = i.md5 || i.baseLayerMD5;
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
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

        const children = projectData.children.filter((c) => !c.listName && !c.target);
        const costumes = [].concat.apply([], children.map((c) => c.costumes || []));
        const sounds = [].concat.apply([], children.map((c) => c.sounds || []));
        const assets = dedupeAssets([].concat.apply([], [costumes, sounds]));

        return Promise.all(assets.map((a) => addFile(a)));
      })
      .then(() => {
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
  }
}());
