import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // REPLACE 'repo-name' with your actual repository name
  // Example: base: '/zlatni-zmaj-evidencija/',
  base: '/volunteering-app/', 
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://volunteering-app-109370863016.europe-west1.run.app',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});