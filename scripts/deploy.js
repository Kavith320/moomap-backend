const { execSync } = require('child_process');
require('dotenv').config();

const host = process.env.DEPLOY_SSH_HOST || '100.76.251.86';
const user = process.env.DEPLOY_SSH_USER || 'moomap';
const path = process.env.DEPLOY_PATH || '~/moomap-backend';

console.log('🚀 Starting deployment from Mac...');

try {
  // 1. Push code from Mac
  console.log('📤 Pushing latest changes to GitHub...');
  execSync('git push origin main', { stdio: 'inherit' });

  // 2. SSH into server and pull
  const sshCmd = `ssh ${user}@${host} "cd ${path} && git pull"`;
  console.log(`🔌 Connecting to server (${user}@${host}) and triggering git pull...`);
  execSync(sshCmd, { stdio: 'inherit' });

  console.log('\n🎉 Deployment completed successfully!');
  console.log('🖥️  The server Git post-merge hook has been triggered to check updates and restart PM2.\n');
} catch (error) {
  console.error('\n❌ Deployment failed:', error.message);
  process.exit(1);
}
