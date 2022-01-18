import html from '@web/rollup-plugin-html';
import {terser} from 'rollup-plugin-terser';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';

export default {
  input: './shaderdemo1.html',
  output: { dir: 'dist' },
  plugins: [html({ minify: true }), terser(), {
    name: 'inline-js',
    closeBundle: () => {
      const js = readFileSync('dist/main.js').toString();
      const html = readFileSync('dist/shaderdemo1.html').toString()
            .replace(`<script type="module" src="./main.js"></script>`, `<script type="module">${js}</script>`);
      writeFileSync('dist/shaderdemo1.html', html);
      unlinkSync(`dist/main.js`);
    }
  }],
};