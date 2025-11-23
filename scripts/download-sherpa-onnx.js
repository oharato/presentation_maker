#!/usr/bin/env node

/**
 * Sherpa-onnx WASMファイルとモデルファイルをダウンロードするスクリプト
 * 
 * 使用方法:
 *   node scripts/download-sherpa-onnx.js
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { get } from 'https';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_DIR = join(__dirname, '..', 'web', 'public', 'models', 'sherpa-onnx');

// ダウンロードするファイルのリスト
const FILES = [
    {
        url: 'https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.js',
        path: 'sherpa-onnx-wasm-main-tts.js'
    },
    {
        url: 'https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.wasm',
        path: 'sherpa-onnx-wasm-main-tts.wasm'
    },
    {
        url: 'https://huggingface.co/spaces/k2-fsa/web-assembly-tts-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-tts.data',
        path: 'sherpa-onnx-wasm-main-tts.data'
    }
];

// 日本語モデル（vits-piper-ja_JP）のファイル
// 注意: 実際のモデルURLは確認が必要です
const MODEL_FILES = [
    // {
    //     url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ja/ja_JP/misaki/low/ja_JP-misaki-low.onnx',
    //     path: 'vits-piper-ja_JP-misaki-low/ja_JP-misaki-low.onnx'
    // },
    // {
    //     url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ja/ja_JP/misaki/low/ja_JP-misaki-low.onnx.json',
    //     path: 'vits-piper-ja_JP-misaki-low/ja_JP-misaki-low.onnx.json'
    // }
];

async function downloadFile(url, destPath, maxRedirects = 5) {
    const fullPath = join(BASE_DIR, destPath);
    const dir = dirname(fullPath);

    // ディレクトリを作成
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    // すでにファイルが存在する場合はスキップ
    if (existsSync(fullPath)) {
        console.log(`✓ Already exists: ${destPath}`);
        return;
    }

    console.log(`Downloading: ${destPath}...`);
    console.log(`  URL: ${url}`);

    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);

        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        get(options, (response) => {
            // リダイレクト処理
            if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 307 || response.statusCode === 308) {
                if (maxRedirects <= 0) {
                    reject(new Error('Too many redirects'));
                    return;
                }

                const redirectUrl = response.headers.location;
                if (!redirectUrl) {
                    reject(new Error('Redirect without location header'));
                    return;
                }

                console.log(`  Redirecting to: ${redirectUrl}`);
                downloadFile(redirectUrl, destPath, maxRedirects - 1).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
                return;
            }

            const fileStream = createWriteStream(fullPath);
            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;
            let lastPercent = 0;

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                    if (percent !== lastPercent && percent % 10 === 0) {
                        console.log(`  Progress: ${percent}%`);
                        lastPercent = percent;
                    }
                }
            });

            pipeline(response, fileStream)
                .then(() => {
                    console.log(`✓ Downloaded: ${destPath} (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
                    resolve();
                })
                .catch((err) => {
                    console.error(`✗ Failed to save: ${destPath}`);
                    reject(err);
                });
        }).on('error', (err) => {
            console.error(`✗ Network error: ${err.message}`);
            reject(err);
        });
    });
}

async function main() {
    console.log('Downloading Sherpa-onnx WASM files and models...\n');

    try {
        // WASMファイルをダウンロード
        for (const file of FILES) {
            await downloadFile(file.url, file.path);
        }

        // モデルファイルをダウンロード
        for (const file of MODEL_FILES) {
            await downloadFile(file.url, file.path);
        }

        console.log('\n✓ All files downloaded successfully!');
        console.log('\nNote: 日本語モデルは手動でダウンロードする必要があります。');
        console.log('詳細は docs/SHERPA_ONNX_SETUP.md を参照してください。');
    } catch (error) {
        console.error('\n✗ Download failed:', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }
}

main();
