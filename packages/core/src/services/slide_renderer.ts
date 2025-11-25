import puppeteer from 'puppeteer';
import { marked } from 'marked';

export class SlideRenderer {
  async renderSlide(markdown: string, outputPath: string): Promise<void> {
    const htmlContent = await marked.parse(markdown);

    // Basic styling for the slide
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            width: 1920px;
            height: 1080px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
          ul { text-align: left; display: inline-block; }
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

    const browser = await puppeteer.launch({
      headless: true,
      args
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(fullHtml);

    await page.screenshot({ path: outputPath as any });
    await browser.close();
    console.log(`Slide image generated: ${outputPath}`);
  }
}
