import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';

export default [
  {
    // For npm
    input: 'src/export.js',
    output: {
      file: 'lib/bundle.js',
      format: 'cjs'
    },
    external: ['jszip', 'cross-fetch']
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
      commonjs(),
      nodeResolve({
        browser: true
      })
    ]
  }
];
