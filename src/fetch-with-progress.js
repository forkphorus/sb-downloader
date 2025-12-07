import {AbortError, HTTPError} from './errors.js';
import environment from './environment.js';

/**
 * @param {string} url
 * @param {(progress: number) => void} progressCallback
 * @param {AbortSignal} [abortSignal] 
 * @returns {Promise<ArrayBuffer>}
 */
const fetchAsArrayBufferWithProgress = async (url, progressCallback, abortSignal) => {
  // We can't always track real progress, but we should still fire explicit 0% and 100% complete events.
  progressCallback(0);

  if (typeof XMLHttpRequest === 'function') {
    // Running in browsers. Use XHR for progress monitoring as it is more universally supported.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        if (xhr.status === 200) {
          progressCallback(1);
          resolve(xhr.response);
        } else {
          reject(new HTTPError(url, xhr.status));
        }
      };
      xhr.onerror = () => {
        reject(new Error(`Failed to fetch ${url}: xhr error`));
      };
      xhr.onabort = () => {
        reject(new AbortError(`Failed to fetch ${url}: aborted`))
      };
      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          progressCallback(e.loaded / e.total);
        }
      };
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          xhr.abort();
        });
      }
      xhr.responseType = 'arraybuffer';
      xhr.open('GET', url);
      xhr.send();
    });
  }

  // Running in Node.js
  // fetch() still lacks a simple way to monitor download progress that properly accounts for Content-Encoding
  const response = await fetch(url, {
    headers: environment.headers
  });
  if (response.status !== 200) {
    throw new HTTPError(url, response.status);
  }
  const buffer = await response.arrayBuffer();
  progressCallback(1);
  return buffer;
};

export default fetchAsArrayBufferWithProgress;
