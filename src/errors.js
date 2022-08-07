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
  constructor (id) {
    super(`Project with ID ${id} is unshared, never existed, or is an invalid ID`);
    this.name = 'CanNotAccessProjectError';
    this.id = id;
  }
}
