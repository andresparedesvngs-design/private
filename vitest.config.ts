/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@server': path.resolve(import.meta.dirname, 'server'),
    },
  },
});
