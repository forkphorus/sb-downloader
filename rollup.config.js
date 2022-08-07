import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';

export default [
  {
    // For Node.js
    input: 'src/export-node.js',
    output: {
      file: 'lib/bundle-node.js',
      format: 'cjs'
    },
    external: ['jszip', 'cross-fetch']
  },
  {
    // For browsers using npm
    input: 'src/export-web.js',
    output: {
      file: 'lib/bundle-web.js',
      format: 'cjs'
    },
    external: ['jszip', 'cross-fetch']
  },
  {
    // For browsers using <script>
    input: 'src/export-web.js',
    output: {
      file: 'lib/bundle-standalone.js',
      format: 'umd',
      name: 'SBDL'
    },
    plugins: [
      // Need to include all dependencies in the standalone script
      commonjs(),
      nodeResolve({
        browser: true
      })
    ]
  }
];
