import {HTTPError} from './errors.js';

// Wrapper around fetch() to make asset downloading more reliable.
//  - Maximum number of concurrent fetch() is limited and queued. Chrome in particular
//    tends to throw errors when you start too many fetch() at once.
//  - Requests are retried with randomized backoff between attempts.
//  - If an asset is determined to not exist, retries are cancelled.
//  - Handles assets.scratch.mit.edu status code quirks.

// Originally based on https://github.com/TurboWarp/scratch-storage/blob/develop/src/safer-fetch.js

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
    .then((res) => {
      if (res.ok) {
        return res.arrayBuffer();
      }

      // Don't retry if the asset doesn't exist.
      // assets.scratch.mit.edu returns 503 instead of 404 for unknown assets for unknown reasons.
      // eg. https://assets.scratch.mit.edu/00000000000000000000000000000000.png
      if (res.status === 404 || res.status === 503) {
        return null;
      }

      throw new HTTPError(url, res.status);
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

/**
 * @param {string} url
 * @param {RequestInit} options 
 * @returns {Promise<ArrayBuffer|null>} ArrayBuffer if loaded. null if does not exist. Rejects if unexpected error.
 */
const fetchAsset = (url, options) => new Promise((resolve) => {
  queue.push([resolve, url, options]);
  checkStartNextFetch();
});

export default fetchAsset;
