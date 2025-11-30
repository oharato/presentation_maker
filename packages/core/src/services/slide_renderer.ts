import puppeteer from 'puppeteer';
import { marked } from 'marked';
import fs from 'fs-extra';
import path from 'path';

export class SlideRenderer {
  async renderSlide(markdown: string, outputPath: string): Promise<void> {
    const htmlContent = await marked.parse(markdown);

    // Basic styling for the slide
    // Prefer locally-installed Japanese-capable fonts (avoid relying on Google Fonts network)
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* Prefer local Noto Sans CJK (installed in container) and fall back to common sans-serif fonts.
             Avoid network-dependent @import so rendering works offline inside containers. */
          body {
            width: 1920px;
            height: 1080px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-family: 'Noto Sans CJK JP', 'Noto Sans JP', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f0f0f0;
            color: #333;
            margin: 0;
            padding: 80px;
            box-sizing: border-box;
            font-size: 48px;
            overflow: hidden;
          }
          .content {
            width: 100%;
            max-width: 1600px;
            text-align: center;
          }
          h1 { font-size: 120px; margin-bottom: 60px; color: #000; }
          h2 { font-size: 80px; margin-bottom: 40px; color: #444; }
          ul { text-align: left; display: block; margin: 0 0 16px 0; padding-left: 40px; list-style-position: outside; }
          li { margin-bottom: 20px; }
          p { margin-bottom: 30px; }
        </style>
      </head>
      <body>
        <div class="content">
          ${htmlContent}
        </div>
      </body>
      </html>
    `;

    const args: string[] = [];
    if (process.env.PUPPETEER_NO_SANDBOX === 'true') {
      args.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    const launchOptions: any = {
      headless: true,
      args,
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    let browser;
    let page;
    let tempHtmlPath: string | undefined;
    try {
      browser = await puppeteer.launch(launchOptions);
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // HTMLコンテンツを一時ファイルに保存
      const outputDir = path.dirname(outputPath);
      tempHtmlPath = path.join(outputDir, `temp_slide_${Date.now()}.html`);
      await fs.writeFile(tempHtmlPath, fullHtml);

      // file:// URLとしてページをロード
      await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' });

      await page.screenshot({ path: outputPath as any });
      console.log(`Slide image generated: ${outputPath}`);
    } catch (err) {
      console.error('Failed to launch Chromium/Chrome for Puppeteer or render slide.');
      console.error('Options tried:', launchOptions);
      console.error('Possible fixes:');
      console.error(' - Install browsers for Puppeteer: `npx puppeteer browsers install chrome`');
      console.error(' - Or set `PUPPETEER_EXECUTABLE_PATH` env var to your Chrome/Chromium binary (e.g. /usr/bin/google-chrome-stable)');
      console.error(' - Ensure puppeteer cache directory is writable (default: ~/.cache/puppeteer)');
      throw err;
    } finally {
      if (browser) {
        await browser.close();
      }
      if (tempHtmlPath) {
        await fs.remove(tempHtmlPath); // 一時ファイルを削除
      }
    }
  }
}
