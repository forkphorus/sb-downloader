import fetch from 'cross-fetch';
import {HTTPError} from './errors';

// Based on https://github.com/TurboWarp/scratch-storage/blob/develop/src/safer-fetch.js

// This throttles and retries fetch() to mitigate the effect of random network errors and
// random browser errors (especially in Chrome)

let currentFetches = 0;
const queue = [];

const MAX_ATTEMPTS = 3;
const MAX_CONCURRENT = 100;
const RETRY_DELAY = 5000;

const finishedFetch = () => {
  currentFetches--;
  checkStartNextFetch();
};

const startNextFetch = ([resolve, url, options]) => {
  let firstError;
  let attempts = 0;

  const attemptToFetch = () => fetch(url, options)
    .then((r) => {
      if (r.ok) {
        return r.arrayBuffer()
      }
      throw new HTTPError(url, r.status);
    })
    .then((buffer) => {
      finishedFetch();
      return buffer;
    })
    .catch((error) => {
      if (error && error.name === 'AbortError') {
        // The error we throw here must be an AbortError.
        finishedFetch();
        throw error;
      }

      console.warn(`Attempt to fetch ${url} failed`, error);
      if (!firstError) {
        firstError = error;
      }

      if (attempts < MAX_ATTEMPTS) {
        attempts++;
        return new Promise((cb) => setTimeout(cb, (attempts + Math.random() - 1) * RETRY_DELAY))
          .then(attemptToFetch);
      }

      finishedFetch();
      throw new Error(`Failed to fetch ${url}: ${firstError}`);
    });

  return resolve(attemptToFetch());
};

const findNextFetch = () => {
  while (true) {
    if (queue.length === 0) {
      return null;
    }
    const next = queue.shift();
    const options = next[2];
    if (options && options.signal && options.signal.aborted) {
      continue;
    }
    return next;
  }
};

const checkStartNextFetch = () => {
  if (currentFetches < MAX_CONCURRENT) {
    const nextFetch = findNextFetch();
    if (nextFetch) {
      currentFetches++;
      startNextFetch(nextFetch);
    }
  }
};

const saferFetchAsArrayBuffer = (url, options) => new Promise((resolve) => {
  queue.push([resolve, url, options]);
  checkStartNextFetch();
});

export default saferFetchAsArrayBuffer;
