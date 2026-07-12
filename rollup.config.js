import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';

const typescriptPlugin = typescript({
  include: ['**/*.ts', '**/*.tsx', '*.ts', '*.tsx'],
});

const PRODUCTION_PLUGIN_CONFIG = {
  input: 'main.ts',
  output: {
    dir: '.',
    sourcemap: 'inline',
    sourcemapExcludeSources: true,
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    typescriptPlugin,
    nodeResolve({browser: true}),
    commonjs(),
  ]
};

const DEV_PLUGIN_CONFIG = {
  input: 'main.ts',
  output: {
    dir: 'docs/test-vault/.obsidian/plugins/better-flashcards/',
    sourcemap: 'inline',
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    typescriptPlugin,
    nodeResolve({browser: true}),
    commonjs(),
    copy({
      targets: [
        { src: 'manifest.json', dest: 'docs/test-vault/.obsidian/plugins/better-flashcards/' },
      ],
    }),
  ]
};

let configs = []

if (process.env.BUILD === "dev") {
  configs.push(DEV_PLUGIN_CONFIG);
} else if (process.env.BUILD === "production" ) {
  configs.push(PRODUCTION_PLUGIN_CONFIG);
} else {
  configs.push(DEV_PLUGIN_CONFIG);
}

export default configs;
