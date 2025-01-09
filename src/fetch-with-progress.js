import {fetch} from 'cross-fetch';
import {AbortError, HTTPError} from './errors.js';
import environment from './environment.js';

/**
 * @param {stirng} url
 * @param {(progress: number) => void} progressCallback
 * @param {AbortSignal} [abortSignal] 
 * @returns {Promise<ArrayBuffer>}
 */
const fetchAsArrayBufferWithProgress = async (url, progressCallback, abortSignal) => {
  // We can't always track real progress, but we should still fire explicit 0% and 100% complete events.
  progressCallback(0);

  if (typeof XMLHttpRequest === 'function') {
    // Running in browsers. We can monitor progress using XHR.
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
  const response = await fetch(url, {
    headers: environment.headers
  });
  if (response.status !== 200) {
    throw new HTTPError(url, response.status);
  }
  const total = +response.headers.get('content-length');
  if (total) {
    let loaded = 0;
    response.body.on('data', (chunk) => {
      // Content-Length is the size of the compressed data (before decoding Content-Encoding) but
      // the chunks we receive here will be the decompressed data.
      // We can rely on the implementation detail of node-fetch using a pipeline as the response
      // body if Content-Encoding is used and read its bytesWritten property instead of summing
      // the length of the chunks.
      if (typeof response.body.bytesWritten === 'number') {
        progressCallback(response.body.bytesWritten / total);
      } else {
        loaded += chunk.length;
        progressCallback(loaded / total);
      }
    });
  }
  const buffer = await response.arrayBuffer();
  progressCallback(1);
  return buffer;
};

export default fetchAsArrayBufferWithProgress;
