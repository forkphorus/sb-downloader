# .sb downloader

https://forkphorus.github.io/sb-downloader/

A downloader for Scratch 1, 2, or 3 projects.

## Development

```sh
git clone https://github.com/forkphorus/sb-downloader.git
cd sb-downloader
npm ci
# For development
npm run dev
# For production (output in `dist`)
npm run build
```

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

Here's the primary parts of the API:

```js
// We assume you've already loaded .sb downloader as `SBDL` using one of the methods listed above.

// All properties are optional. In fact the entire object is optional.
const options = {
  // May be called periodically with progress updates.
  onProgress: (type, loaded, total) => {
    // type is either 'project', 'assets', or 'compress'
    console.log(type, loaded / total);
  },

  // The date to use as the "last modified" time for the files inside generated projects.
  // Defaults to an arbitrary time in the past.
  // Must be a `Date` object.
  date: new Date(),

  // Whether to compress generated projects.
  // Generated projects take longer to generate but are much smaller.
  // Defaults to true.
  compress: true
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

You can also abort the download after starting it. Note that while we try to make sure that ongoing and future network activity is cancelled, some activity may continue for a brief period. Regardless, the Promise returned by download* should reject (not necessarily immediately) if abort is called before it resolves.

```js
const abortController = new AbortController();
const options = {
  // An AbortSignal that, when aborted, stops the project download.
  signal: abortController.signal
};

SBDL.downloadProjectFromID('60917032', options)
  .then((project) => {
    // ...
  });

setTimeout(() => {
  abortController.abort();
}, 1000);
```

If you absolutely need to cancel all activity immediately, you can download projects from a Worker instead, which will also prevent downloading from causing slowdowns on the main thread.

.sb downloader is compatible with most Scratch 3 forks as long as they haven't deviated too far.

```js
const options = {
  // $id is will be replaced with the asset ID (md5ext)
  // The URL to use will vary for each mod. Use developer tools to find it.
  assetHost: 'https://assets.example.com/$id'
};
// Use downloadProjectFromURL or fetch it yourself and use downloadProjectFromBinaryOrJSON
// The URL to use will vary for each mod. Use developer tools to find it.
const project = await SBDL.downloadProjectFromURL(`https://projects.example.com/${id}`);
```

For a much more thorough example, see `index.html`.

## Privacy

In Node.js, .sb downloader will only talk directly to the Scratch API.

In browsers, in order to access the project token and title, .sb downloader may send the project ID to a server under our control as it can't directly access certain Scratch APIs. The ID may be recorded for up to 24 hours for caching purposes only.
