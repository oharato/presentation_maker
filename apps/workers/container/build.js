const esbuild = require('esbuild');

esbuild.build({
    entryPoints: ['index.ts'],
    bundle: true,
    outfile: 'dist/index.js',
    format: 'esm',
    external: ['cloudflare:containers', 'cloudflare:workers'],
    platform: 'node',
    target: 'es2020',
}).catch(() => process.exit(1));