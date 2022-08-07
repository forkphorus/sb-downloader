import fetch from 'cross-fetch';
import { HTTPError } from './errors';

const fetchAsArrayBufferWithProgress = (url, progressCallback) => {
  if (typeof XMLHttpRequest === 'function') {
    // Running in browsers. We can monitor progress using XHR.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(xhr.response);
        } else {
          reject(new HTTPError(url, xhr.status));
        }
      };
      xhr.onerror = () => {
        reject(new Error(`Failed to fetch ${url}: xhr error`));
      };
      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          progressCallback(e.loaded / e.total);
        }
      };
      xhr.responseType = 'arraybuffer';
      xhr.open('GET', url);
      xhr.send();
    });
  }

  // Running in Node.js. For now we just won't have progress monitoring.
  return fetch(url)
    .then((r) => r.arrayBuffer());
};

export default fetchAsArrayBufferWithProgress;
