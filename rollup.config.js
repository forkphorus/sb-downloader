import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';

const external = ['jszip', 'cross-fetch', '@turbowarp/json'];

export default [
  {
    // For Node.js
    input: 'src/export-node.js',
    output: {
      file: 'lib/bundle-node.cjs',
      format: 'cjs'
    },
    external
  },
  {
    // For browsers using npm
    input: 'src/export-web.js',
    output: {
      file: 'lib/bundle-web.cjs',
      format: 'cjs'
    },
    external
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
