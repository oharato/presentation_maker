const fs = require('fs-extra');
const path = require('path');

async function copyFiles() {
    const rootDir = path.resolve(__dirname, '../../');
    const containerDir = __dirname;

    console.log('Copying files to container directory...');

    // Copy src directory
    const srcSource = path.join(rootDir, 'src');
    const srcDest = path.join(containerDir, 'src');
    await fs.copy(srcSource, srcDest);
    console.log(`Copied src from ${srcSource} to ${srcDest}`);

    console.log('File copy complete.');
}

copyFiles().catch(err => {
    console.error('Error copying files:', err);
    process.exit(1);
});
