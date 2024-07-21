import environment from './environment.js';
import {name, version} from '../package.json';

environment.canAccessScratchAPI = true;
environment.headers['user-agent'] = `SBDL/${version} (+https://www.npmjs.com/package/${name})`;

export * from './downloader.js';
