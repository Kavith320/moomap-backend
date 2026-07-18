import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: [
    '100.76.251.86',
    '*.ts.net',
    '*.taile78ad3.ts.net',
    'moomap-localserver.taile78ad3.ts.net',
    'localhost:3001'
  ],
};

export default nextConfig;
