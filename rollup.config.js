import fs from 'node:fs';
import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';

const packageJSONText = fs.readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf-8');
const packageJSON = JSON.parse(packageJSONText);

const external = ['@turbowarp/jszip', '@turbowarp/json'];

const bannerText = `SBDL v${packageJSON.version} <https://github.com/forkphorus/sb-downloader>\n\n${fs.readFileSync('LICENSE', 'utf-8').trim()}`;
const banner = `/*!\n${bannerText.split('\n').map(line => line ? ` * ${line}` : ' *').join('\n')}\n */\n`;

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
      format: 'cjs',
      banner
    },
    external
  },
  {
    // For browsers using <script>
    input: 'src/export-standalone.js',
    output: {
      file: 'lib/bundle-standalone.js',
      format: 'umd',
      name: 'SBDL',
      banner
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
