import fs from 'node:fs/promises';
import path from 'node:path';
import * as SBDL from './export-node.js';

// Manually wrap at 80 columns
const HELP = `
SBDL: Downloader for Scratch projects

Usage: sbdl [options...] <projects...>

Projects can be:
 - A Scratch project ID eg. '60917032'
 - A Scratch project URL eg. 'https://scratch.mit.edu/projects/60917032/'
 - An arbitrary URL eg. 'https://example.com/project.sb3'
If multiple projects are specified, they will be downloaded sequentially.

Options:
 --help     Shows this screen
 --legacy   For Scratch project IDs or URLs, downloads the legacy version
            of the project instead of the latest version.

Projects will be saved in the current working directory with a file name
based on the detected title of the project.
`;

const printHelp = () => {
  console.log(HELP.trim());
};

/**
 * @param {string} string
 * @returns {string|null}
 */
const extractProjectID = (string) => {
  if (/^\d+$/.test(string)) {
    return string;
  }
  let match = string.match(/^https?:\/\/scratch\.mit\.edu\/projects\/(\d+)\/?/);
  if (match) {
    return match[1];
  }
  return null;
};

/**
 * @param {string} string
 * @returns {boolean}
 */
const isURL = (string) => string.startsWith('http:') || string.startsWith('https:');

// ANSI escape codes
const ESCAPE = '\u001b[';
const RESET = `${ESCAPE}0m`;
const CLEAR = `${RESET}${ESCAPE}1K\r`;
const BG_WHITE = `${ESCAPE}107m`;
const FG_BLACK = `${ESCAPE}30m`;
const FG_RED = `${ESCAPE}31m`;
const FG_GREEN = `${ESCAPE}32m`;

const clearProgress = () => {
  process.stdout.write(CLEAR);
};

/**
 * @param {string} message
 * @param {number} progress Progress from 0-1
 */
const printProgressUpdate = (message, progress) => {
  const width = process.stdout.columns;
  message = message.substring(0, width).padEnd(width, ' ');
  const filled = message.substring(0, progress * width);
  const unfilled = message.substring(progress * width);
  process.stdout.write(`${CLEAR}${BG_WHITE}${FG_BLACK}${filled}${RESET}${unfilled}`);
};

/**
 * Remove characters that can not reliably be used in file names.
 * @param {string} name
 * @returns {string}
 */
const sanitizeFileName = (name) => name.replace(/[\\\/:*?"<>|\0]/g, '_')

const run = async () => {
  const args = process.argv.slice(2);
  const options = args.filter(i => i.startsWith('-'));
  const projects = args.filter(i => !i.startsWith('-'));

  if (projects.length === 0 || options.includes('--help')) {
    printHelp();
    return;
  }

  const isLegacy = options.includes('--legacy');

  for (const project of projects) {
    const onProgress = (type, loaded, total) => {
      let progress = loaded / total;
      let message;
      if (type === 'metadata') {
        message = 'Downloading project metadata';
      } else if (type === 'project') {
        message = 'Downloading project data';
      } else if (type === 'assets') {
        message = `Downloading assets (${loaded}/${total})`;
      } else if (type === 'compress') {
        message = 'Compressing project';
      } else {
        message = `Unknown progress type: ${type}`;
      }
      printProgressUpdate(message, progress);
    };

    const options = {
      onProgress
    };

    const id = extractProjectID(project);

    let downloadedProject;
    if (id) {
      if (isLegacy) {
        console.log(`Downloading legacy project from ID: ${id}`);
        downloadedProject = await SBDL.downloadLegacyProjectFromID(id, options);
      } else {
        console.log(`Downloading project from ID: ${id}`);
        downloadedProject = await SBDL.downloadProjectFromID(id, options);
      }
    } else if (isURL(project)) {
      console.log(`Downloading project from URL: ${project}`);
      downloadedProject = await SBDL.downloadProjectFromURL(project, options);
    } else {
      throw new Error(`Don't know how to interpret project: ${project}`);
    }

    let title;
    if (id) {
      title = downloadedProject.title ? `${downloadedProject.title} (${id})` : id;
    } else {
      title = downloadedProject.title || 'Project';
    }

    const filename = path.resolve(`${sanitizeFileName(title)}.${downloadedProject.type}`);
    printProgressUpdate(`Saving to ${filename}`, 0);
    await fs.writeFile(filename, new Uint8Array(downloadedProject.arrayBuffer));

    clearProgress();
    console.log(`${FG_GREEN}Saved to: ${filename}${RESET}`);
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(`${RESET}${FG_RED}Something went wrong :(${RESET}`);
    console.error(err);
    process.exit(1);
  });
