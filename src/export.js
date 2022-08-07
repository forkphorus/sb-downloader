// Check dependencies in web bundle
import JSZip from 'jszip';
if (!JSZip) {
  throw new Error('.sb downloader requires JSZip 3.x, which is missing. Please see the README.');
}

export * from './downloader';
