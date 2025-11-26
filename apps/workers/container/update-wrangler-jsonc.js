const fs = require('fs');
const path = require('path');

const tag = process.argv[2];

if (!tag) {
  console.error('Usage: node update-wrangler-jsonc.js <image_tag>');
  process.exit(1);
}

const wranglerJsoncPath = path.join(__dirname, 'wrangler.jsonc');

try {
  const wranglerJsoncContent = fs.readFileSync(wranglerJsoncPath, 'utf8');
  const wranglerConfig = JSON.parse(wranglerJsoncContent);

  if (wranglerConfig && wranglerConfig.env && wranglerConfig.env.production && wranglerConfig.env.production.containers && wranglerConfig.env.production.containers.length > 0) {
    wranglerConfig.env.production.containers[0].image = `registry.cloudflare.com/1a02a58c61ffef10bc9598f738805e54/presentation-maker-worker:${tag}`;
    fs.writeFileSync(wranglerJsoncPath, JSON.stringify(wranglerConfig, null, 4), 'utf8');
    console.log(`Updated wrangler.jsonc with image tag: ${tag}`);
  } else {
    console.error('Could not find the container image path in wrangler.jsonc');
    process.exit(1);
  }
} catch (error) {
  console.error('Error updating wrangler.jsonc:', error);
  process.exit(1);
}
