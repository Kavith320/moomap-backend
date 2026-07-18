const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Load root .env if it exists
const rootEnvPath = path.join(__dirname, '../.env');
let frontendPort = '3001';
let backendPort = '3000';
let customApiUrl = '';

if (fs.existsSync(rootEnvPath)) {
  const envContent = fs.readFileSync(rootEnvPath, 'utf8');
  const envVars = {};
  envContent.split(/\r?\n/).forEach(line => {
    // Ignore comments
    if (line.trim().startsWith('#')) return;
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      envVars[key] = value.trim();
    }
  });
  if (envVars.FRONTEND_PORT) frontendPort = envVars.FRONTEND_PORT;
  if (envVars.BACKEND_PORT) backendPort = envVars.BACKEND_PORT;
  if (envVars.NEXT_PUBLIC_API_URL) customApiUrl = envVars.NEXT_PUBLIC_API_URL;
}

const args = process.argv.slice(2);
const command = args[0] || 'dev'; // 'dev', 'build', 'start'

const finalApiUrl = customApiUrl || `http://localhost:${backendPort}`;

console.log(`\x1b[35m[Next.js Runner]\x1b[0m Executing: next ${command}`);
if (command === 'dev' || command === 'start') {
  console.log(`\x1b[35m[Next.js Runner]\x1b[0m Frontend Port: ${frontendPort}`);
}
console.log(`\x1b[35m[Next.js Runner]\x1b[0m Backend Port: ${backendPort}`);
console.log(`\x1b[35m[Next.js Runner]\x1b[0m API URL: ${finalApiUrl}\n`);

const env = {
  ...process.env,
  PORT: frontendPort,
  NEXT_PUBLIC_API_URL: finalApiUrl
};

const child = spawn('npx', ['next', command], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
  env
});

child.on('close', (code) => {
  process.exit(code);
});
