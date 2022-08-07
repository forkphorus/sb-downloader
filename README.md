# .sb downloader

https://forkphorus.github.io/sb-downloader/

A downloader for Scratch 1, 2, or 3 projects.

## API

You can use .sb downloader in your own programs with our brand new API that no longer causes physical pain to use.

You can install it from npm:

```
npm install @turbowarp/sbdl
```

```js
import * as SBDL from '@turbowarp/sbdl';
// or if you still use require():
const SBDL = require('@turbowarp/sbdl');
```

Or if you just want your code to run in a browser, you can use a `<script>` tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@turbowarp/sbdl@2.0.0-alpha.2/lib/bundle-standalone.min.js"></script>
<script>
  // .sb downloader is exported as `SBDL` on window
</script>
```

Here's the API:

```js
// We assume you've already loaded .sb downloader as `SBDL` using one of the methods listed above.

// Optional options object.
// If you don't need to specify any options, you can just not provide this object.
const options = {
  // May be called periodically with progress updates.
  onProgress: (type, loaded, total) => {
    // type is either 'project', 'assets', or 'compress'
    console.log(type, loaded / total);
  }
};

// Download using any of these methods.
// These return a Promise that eventually resolves or rejects. We recommend you use async functions.
const project = await SBDL.downloadProjectFromID('60917032', options);
const project = await SBDL.downloadLegacyProjectFromID('60917032', options);
const project = await SBDL.downloadProjectFromURL('https://packager.turbowarp.org/example.sb3', options);
const project = await SBDL.downloadProjectFromBinaryOrJSON(fs.readFileSync('project.json'), options);

// The output:
// type is 'sb', 'sb2', or 'sb3'
const type = project.type;
// arrayBuffer is an ArrayBuffer of the compressed project data in the format given by type.
const arrayBuffer = project.arrayBuffer;
// For shared projects loaded from an ID, this is the title of the project, if any.
// If the title couldn't be found, this will be an empty string. It is your job to handle that and default to
// something else such as the project's ID if necessary.
const title = project.title;

// This method fetches the project's data from api.scratch.mit.edu/projects/id. Only works for shared projects.
// We use it internally for fetching project tokens and titles. We export it in case you find it useful too.
const metadata = await SBDL.getProjectMetadata('60917032');
```

For a much more thorough example, see `index.html`.

## Privacy

In Node.js, .sb downloader will only talk directly to the Scratch API.

In browsers, in order to access the project token and title, .sb downloader may send the project ID to a server under our control as it can't directly access certain Scratch APIs. The ID may be recorded for up to 24 hours for caching purposes only.
