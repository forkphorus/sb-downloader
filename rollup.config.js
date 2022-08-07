export default {
  input: 'src/export.js',
  output: {
    file: 'lib/bundle.js',
    format: 'umd',
    name: 'SBDL',
    globals: {
      jszip: 'JSZip',
      'cross-fetch': 'fetch'
    }
  },
  external: ['jszip', 'cross-fetch']
};
