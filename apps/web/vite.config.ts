import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(
{
    plugins: [react()],
    server:
    {
        port: 5173,

        // Proxy so the browser talks to one origin and CORS never comes up in dev.
        proxy: { '/api': { target: 'http://localhost:3001' } },
    },
});