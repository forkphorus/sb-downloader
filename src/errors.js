const sanitizeURL = (url) => url.replace(/\?token=[^&#]+/, '?token=x');

export class HTTPError extends Error {
  /**
   * @param {string} url
   * @param {number} status HTTP status
   */
  constructor (url, status) {
    super(`Unexpected status ${status} while fetching ${sanitizeURL(url)}`);
    this.name = 'HTTPError';
    this.url = url;
    this.status = status;
  }
}

export class CannotAccessProjectError extends Error {
  constructor (message) {
    super(message);
    this.name = 'CanNotAccessProjectError';
  }
}

/**
 * NOTE: Do NOT use `instanceof AbortError` to detect abort errors.
 * Use `error.name === 'AbortError'` instead.
 */
export class AbortError extends Error {
  constructor (message) {
    super(message || 'The operation was aborted.');
    this.name = 'AbortError';
  }
}
