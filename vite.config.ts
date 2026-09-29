import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/commit-chorus/ in production.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/commit-chorus/' : '/',
  plugins: [react()],
  test: { include: ['tests/**/*.test.ts'] },
}));
