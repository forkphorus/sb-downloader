import fs from 'node:fs';
import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import license from 'rollup-plugin-license';

const packageJSONText = fs.readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf-8');
const packageJSON = JSON.parse(packageJSONText);

const external = ['@turbowarp/jszip', '@turbowarp/json'];

const headerPlugin = license({
  banner: {
    commentStyle: 'ignored',
    content: `SBDL v${packageJSON.version} <https://github.com/forkphorus/sb-downloader>\n\n${fs.readFileSync('LICENSE', 'utf-8')}`
  }
});

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
    external,
    plugins: [
      headerPlugin
    ]
  },
  {
    // For browsers using <script>
    input: 'src/export-standalone.js',
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
      }),
      headerPlugin
    ]
  }
];
