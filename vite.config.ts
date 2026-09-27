import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works under any sub-path (served at /yakuza-clone/).
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
} as never);
