import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true,
    },
  ],
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  plugins: [
    resolve({
      extensions: ['.mjs', '.js', '.jsx', '.json', '.ts', '.tsx'],
      browser: true,
    }),
    commonjs(),
    replace({ preventAssignment: true, 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production') }),
    typescript({ tsconfig: './tsconfig.json' }),
  ],
});
