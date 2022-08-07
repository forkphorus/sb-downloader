export class HTTPError extends Error {
  /**
   * @param {string} url
   * @param {number} status HTTP status
   */
  constructor (url, status) {
    super(`Unexpected error ${status} while fetching ${url}`);
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