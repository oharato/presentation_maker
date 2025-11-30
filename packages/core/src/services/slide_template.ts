export const SLIDE_STYLE_ID = 'slide-renderer-styles';
export const SLIDE_PREVIEW_CLASS = 'slide-preview-container';
export const SLIDE_CONTENT_CLASS = 'slide-content';

export const SLIDE_CSS = `
.${SLIDE_PREVIEW_CLASS} {
  width: 1280px;
  height: 720px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  padding: 50px;
  box-sizing: border-box;
  overflow: hidden;
}
.${SLIDE_CONTENT_CLASS} {
  width: 100%;
  max-width: 1060px;
  text-align: center;
  font-family: 'Noto Sans CJK JP', 'Noto Sans JP', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #333;
  font-size: 32px;
  line-height: 1.5;
}
.${SLIDE_CONTENT_CLASS} h1 { font-size: 80px; margin-bottom: 40px; color: #000; font-weight: bold; }
.${SLIDE_CONTENT_CLASS} h2 { font-size: 54px; margin-bottom: 26px; color: #444; font-weight: bold; }
.${SLIDE_CONTENT_CLASS} ul { text-align: left; display: block; margin: 0 0 16px 0; padding-left: 40px; list-style-position: outside; }
.${SLIDE_CONTENT_CLASS} li, .${SLIDE_CONTENT_CLASS} ul li { display: block; margin-bottom: 14px; }
.${SLIDE_CONTENT_CLASS} ul ul { margin-left: 24px; margin-top: 8px; }
.${SLIDE_CONTENT_CLASS} p { margin-bottom: 20px; }
`;

export function buildFullHtmlForPuppeteer(innerHtml: string) {
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      /* Container-level layout for Puppeteer (1920x1080) */
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
      .content { width: 100%; max-width: 1600px; text-align: center; }
      ${SLIDE_CSS}
    </style>
  </head>
  <body>
    <div class="content">
      <div class="${SLIDE_CONTENT_CLASS}">
        ${innerHtml}
      </div>
    </div>
  </body>
  </html>`;
}
