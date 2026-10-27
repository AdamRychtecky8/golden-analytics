/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // The logic modules are pure functions, so tests don't need a browser.
    environment: 'node',
  },
});
