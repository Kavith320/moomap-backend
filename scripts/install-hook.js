const fs = require('fs');
const path = require('path');

const sourceHook = path.join(__dirname, 'post-merge.sh');
const targetHook = path.join(__dirname, '../.git/hooks/post-merge');

console.log('⚙️ Installing Git post-merge hook...');

if (!fs.existsSync(path.join(__dirname, '../.git'))) {
  console.error('❌ Error: .git directory not found. Are you in the root of the Git repository?');
  process.exit(1);
}

try {
  // Ensure the target directory exists (hooks directory)
  fs.mkdirSync(path.dirname(targetHook), { recursive: true });

  // Copy post-merge.sh to .git/hooks/post-merge
  fs.copyFileSync(sourceHook, targetHook);
  console.log(`✅ Hook copied to ${targetHook}`);

  // Make it executable (Unix only)
  if (process.platform !== 'win32') {
    fs.chmodSync(targetHook, '755');
    console.log('✅ Hook marked as executable');
  }

  console.log('🎉 Git post-merge hook setup completed successfully!');
} catch (error) {
  console.error('❌ Failed to install Git hook:', error.message);
  process.exit(1);
}
