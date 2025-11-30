import puppeteer from 'puppeteer';
import { marked } from 'marked';
import fs from 'fs-extra';
import path from 'path';
import { buildFullHtmlForPuppeteer } from './slide_template';

export class SlideRenderer {
  async renderSlide(markdown: string, outputPath: string): Promise<void> {
    const htmlContent = await marked.parse(markdown);

    const fullHtml = buildFullHtmlForPuppeteer(htmlContent);

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
