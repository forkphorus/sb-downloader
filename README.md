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

<!--
Or if you just want your code to run in a browser, you can use a `<script>` tag:

```html
<script src="TODO"></script>
<script>
  // .sb downloader is exported as `SBDL` on window
</script>
```
-->

Here's the API:

```js
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
// arrayBuffer is an ArrayBuffer of the compressed project data
const arrayBuffer = project.arrayBuffer;
// For projects loaded from an ID, title is the title of the project, if any, if the project is shared
// The title couldn't be found, this will be an empty string. It is your job to handle that and default to
// a different title, such as the project ID.
const title = project.title;
```
