# .sb downloader

https://forkphorus.github.io/sb-downloader/

A downloader for Scratch 1, Scratch 2, or Scratch 3 projects.

## Development

```sh
git clone https://github.com/forkphorus/sb-downloader.git
cd sb-downloader
npm ci
# For development
npm run dev
# Run tests. Requires a decent internet connection.
npm test
# For production (output in `dist`)
npm run build
npm run preview
```

## CLI

We have a simple CLI. It's primarily intended to be a simple example of how to use the API, but may be useful on its own anyways. Probably requires Node version 14 or later.

Install from npm:

```bash
npm install --global @turbowarp/sbdl
```

Use project IDs, project URLs, or other URLs to download projects. If multiple projects are specified, they will be downloaded sequentially.

```bash
sbdl 60917032
sbdl https://scratch.mit.edu/projects/60917032/
sbdl https://packager.turbowarp.org/example.sb3
```

To download the legacy version of Scratch project IDs or URLs, put --legacy anywhere
```bash
sbdl --legacy 60917032
```

## API

You can install .sb downloader from npm:

```
npm install @turbowarp/sbdl
```

```js
import * as SBDL from '@turbowarp/sbdl';
// or if you still use require():
const SBDL = require('@turbowarp/sbdl');
```

If you just want to run it in a website and can't use a package manager, you can use a `<script>` tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@turbowarp/sbdl@2.3.0/lib/bundle-standalone.min.js"></script>
<script>
  // .sb downloader is exported as `SBDL` on window
  // See the "Standalone version" below for more information specifically about the standalone version
</script>
```

Browsers with full support:

 - Chrome >= 66
 - Safari >= 12.1
 - Firefox >= 57
 - Edge >= 79

The primary limiting factors are support for AbortController (optional for cancelling downloads) and TextDecoder (for determining the type of pre-compressed projects). You may be able to polyfill these on your own.

### Simple usage

```js
// We assume you've already loaded .sb downloader as `SBDL` using one of the methods above.

// All options are optional.
// If you don't need to set any options, you can simply not provide it to the download methods.
const options = {
  // May be called periodically with progress updates.
  onProgress: (type, loaded, total) => {
    // type is 'metadata', 'project', 'assets', or 'compress'
    console.log(type, loaded / total);
  }
};

// Download using any of these methods. These return a Promise that eventually resolves or rejects.
// They all return the same type of object documented further below.
// If you have a Scratch project ID:
const project = await SBDL.downloadProjectFromID('60917032', options);
const project = await SBDL.downloadLegacyProjectFromID('60917032', options);
// If you have a direct URL to download the project.json or compressed project:
// The URL MUST be a direct URL. Links like https://scratch.mit.edu/projects/104 will NOT work.
const project = await SBDL.downloadProjectFromURL('https://packager.turbowarp.org/example.sb3', options);
// If you already downloaded the project.json or compressed project:
const project = await SBDL.downloadProjectFromJSON(fs.readFileSync('project.json', 'utf-8'), options);
const project = await SBDL.downloadProjectFromBuffer(fs.readFileSync('project.json'), options);

// The output:
// type is 'sb', 'sb2', or 'sb3'
const type = project.type;
// arrayBuffer is an ArrayBuffer of the compressed project data in the format given by type.
const arrayBuffer = project.arrayBuffer;
// For projects shared on Scratch and downloaded from an ID, this will be the project title on Scratch if
// the project is shared. For projects loaded from a URL, this will be inferred based on the project's URL.
// If the title couldn't be found, this will be an empty string. It is your job to handle that and default to
// something else such as the project's ID if necessary.
const title = project.title;
```

### Compression

There are options to configure how projects should be compressed. Projects are compressed by default in a way that is fully deterministic and reproducible -- the same project should always output the exact same set of bytes. We expect that most people will want to use the default settings.

```js
const options = {
  // The date to use as the "last modified" time for the files inside generated projects.
  // Defaults to an constant date in the past if not set (Fri, 31 Dec 2021 00:00:00 GMT) so
  // that generated projects are deterministic and reproducible.
  // Must be a `Date` object.
  date: new Date(),

  // Whether to compress generated projects.
  // Generated projects take longer to generate but are much smaller.
  // Defaults to true.
  compress: true
};
```

### Aborting

You can also abort the download after starting it. Note that while we try to stop ongoing and future network activity, some activity may continue for a brief period depending on what step the download process was on. Regardless, the Promise returned by download* should eventually reject if abort is called before it resolves.

Requires separate AbortController polyfill in Node.js versions older than v15 and some older browsers.

```js
const abortController = new AbortController();
const options = {
  // An AbortSignal that, when aborted, stops the project download.
  signal: abortController.signal
};

SBDL.downloadProjectFromID('60917032', options)
  .then((project) => {
    // ...
  })
  .catch((error) => {
    if (error && error.name === 'AbortError') {
      // Aborted...
    } else {
      // Some other error...
    }
  });

// Cancel the download after 1 second
setTimeout(() => {
  abortController.abort();
}, 1000);
```

If you absolutely need to cancel all activity immediately, you can run the downloader in a Worker and terminate that Worker to cancel it. This will also prevent the downloader from causing lag on the main thread.

### Fetching metadata

```js
// This method fetches the project's metadata from https://api.scratch.mit.edu/projects/id
// Example data: https://api.scratch.mit.edu/projects/104
// Returned promise rejects when the project is unshared.
// We use this internally for fetching project tokens and titles. We export it in case you find it useful too.
const metadata = await SBDL.getProjectMetadata('60917032');
```

### Scratch forks

.sb downloader should be compatible with most Scratch forks. It only parses projects to find out what costumes and sounds it needs to download, so things like new blocks won't cause problems. There is an option to configure where it will fetch assets from.

```js
const options = {
  // $id is will be replaced with the asset ID (md5ext) eg. "188325c56b79ff3cd58497c970ba87a6.svg"
  // The URL to use will vary for each mod. You can usually examine network requests using
  // your browser's developer tools to find this.
  assetHost: 'https://assets.example.com/$id'
};

// Use downloadProjectFromURL or fetch the project's JSON yourself and use downloadProjectFromBuffer.
// The URL to use will vary for each mod. You can usually examine network requests using
// your browser's developer tools to find this.
const project = await SBDL.downloadProjectFromURL(`https://projects.example.com/${id}`);
```

### Reading and modifying project.json

Sometimes you may want to read or modify the project's project.json. Decompressing the entire project and recompressing it is slow and error-prone, so we have an option for this purpose. This option is only available for sb2 and sb3 projects. For sb projects, it silently won't be called.

```js
const options = {
  // Allows you to read or overwrite project.json.
  // This will be called at the end of the download.
  // If this callback returns an object, the object will replace the project's project.json.
  // You may return a Promise, in which case the downloader will wait for your promise to resolve.
  // type is either 'sb2' or 'sb3'
  // Modifiying projectData in-place will not function properly. You must return an object.
  // If you modify projectData in-place then make sure to return projectData; at the end.
  processJSON: (type, projectData) => {
    console.log(type, projectData);
    if (type === 'sb3') {
      return optimize(projectData);
    }
  }
};
```

### Standalone version

The standalone version loaded via `<script>` tag also re-exports some internal libraries so that you don't have to add another copy.

```html
<script src="https://.../bundle-standalone.min.js"></script>
<script>
  // https://stuk.github.io/jszip/
  var JSZip = SBDL.JSZip;

  // https://www.npmjs.com/package/@turbowarp/json
  var ExtendedJSON = SBDL.ExtendedJSON; 
</script>
```

## Unshared projects

Unshared projects are no longer accessible due to Scratch API changes. More information: https://docs.turbowarp.org/unshared-projects

## Privacy

In Node.js, by default .sb downloader will only talk directly to the Scratch API: api.scratch.mit.edu, projects.scratch.mit.edu, and assets.scratch.mit.edu.

In browsers, in order to access the project token and title, .sb downloader may send the project ID to a server under our control (trampoline.turbowarp.org or trampoline.turbowarp.xyz) as it can't directly access certain Scratch APIs. The ID may be recorded for up to 24 hours for caching purposes only.
