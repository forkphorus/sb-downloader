import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';

export default [
  {
    // For npm
    input: 'src/export.js',
    output: {
      file: 'lib/bundle.js',
      format: 'cjs'
    },
    external: ['jszip', 'cross-fetch'],
    plugins: [
      json()
    ]
  },
  {
    // For use in a <script>
    input: 'src/export.js',
    output: {
      file: 'lib/bundle-standalone.js',
      format: 'umd',
      name: 'SBDL'
    },
    plugins: [
      json(),
      commonjs(),
      nodeResolve({
        browser: true
      })
    ]
  }
];
