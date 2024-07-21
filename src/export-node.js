import environment from './environment.js';

environment.canAccessScratchAPI = true;

// The version here should be incremented if our traffic pattern ever changes significantly
environment.headers['user-agent'] = 'SBDL/1.0 (+https://www.npmjs.com/package/@turbowarp/sbdl)';

export * from './downloader.js';
