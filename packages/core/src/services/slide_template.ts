import fs from 'fs';
import path from 'path';

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
.${SLIDE_CONTENT_CLASS} ul { text-align: left; display: block; margin: 0 0 16px 0; padding-left: 28px; list-style-position: inside; list-style-type: disc; }
.${SLIDE_CONTENT_CLASS} li, .${SLIDE_CONTENT_CLASS} ul li { display: list-item; margin-bottom: 14px; }
.${SLIDE_CONTENT_CLASS} ul ul { margin-left: 20px; margin-top: 8px; }
.${SLIDE_CONTENT_CLASS} p { margin-bottom: 20px; }
`;

function getMimeType(fp: string) {
  const ext = path.extname(fp).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

export function buildFullHtmlForPuppeteer(innerHtml: string, baseDir?: string) {
  // Inline local images referenced with relative paths by converting them
  // to data: URLs so Puppeteer (loading file:// temp HTML) can render them
  // without network access. baseDir defaults to the repo `input/` folder.
  try {
    // Try to locate the repository/workspace root (where `pnpm-workspace.yaml` or top-level `package.json` lives)
    function findRepoRoot(startDir: string) {
      let dir = startDir;
      let lastWithPackageJson: string | null = null;
      while (true) {
        try {
          const hasPnpmWorkspace = fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'));
          const hasGit = fs.existsSync(path.join(dir, '.git'));
          const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));

          if (hasPnpmWorkspace || hasGit) {
            return dir;
          }

          if (hasPackageJson) {
            lastWithPackageJson = dir;
          }
        } catch (e) {}

        const parent = path.dirname(dir);
        if (!parent || parent === dir) break;
        dir = parent;
      }

      // Prefer the highest directory that had a package.json (monorepo root),
      // otherwise fall back to the original startDir.
      if (lastWithPackageJson) return lastWithPackageJson;
      return startDir;
    }

    const repoRoot = findRepoRoot(process.cwd());
    const defaultBase = path.join(repoRoot, 'input');
    if (process.env.SLIDE_RENDER_DEBUG === 'true') {
      console.log(`SlideRenderer: repoRoot=${repoRoot}, defaultBase=${defaultBase}`);
    }

    function searchForLocalFile(srcPath: string, preferredBase?: string) {
      const tried: string[] = [];

      const candidates = [
        preferredBase && path.resolve(preferredBase, srcPath),
        path.resolve(process.cwd(), srcPath),
        path.resolve(defaultBase, srcPath),
      ].filter(Boolean) as string[];

      if (process.env.SLIDE_RENDER_DEBUG === 'true') {
        console.log(`SlideRenderer: searchForLocalFile candidates for '${srcPath}': ${JSON.stringify(candidates)}`);
      }

      for (const c of candidates) {
        tried.push(c);
        try {
          if (fs.existsSync(c)) {
            if (process.env.SLIDE_RENDER_DEBUG === 'true') {
              console.log(`SlideRenderer: searchForLocalFile found file candidate: ${c}`);
            }
            return c;
          }
        } catch (e) {
          // ignore fs errors for candidates
        }
      }

      // Last resort: search by basename under repo (limited, skipping node_modules/.git/output)
      const basename = path.basename(srcPath);
      const root = process.cwd();
      const skipDirs = new Set(['node_modules', '.git', 'output', 'dist', 'build']);

      const stack = [root];
      let depth = 0;
      while (stack.length && depth < 5) {
        const dir = stack.pop();
        if (!dir) break;
        try {
          const items = fs.readdirSync(dir);
          for (const it of items) {
            const full = path.join(dir, it);
            try {
              const st = fs.statSync(full);
              if (st.isFile() && it === basename) {
                return full;
              }
              if (st.isDirectory() && !skipDirs.has(it)) {
                stack.push(full);
              }
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          // ignore
        }
        depth++;
      }

      return undefined;
    }

    innerHtml = innerHtml.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (m: string, src: string) => {
      try {
        if (!src) return m;
        const s = src.trim();
        // Skip absolute URLs and already inlined data URLs
        if (/^data:/i.test(s) || /^https?:\/\//i.test(s) || /^\/\//.test(s) || /^blob:/i.test(s)) return m;

        const found = searchForLocalFile(s, baseDir);
        if (!found) {
          if (process.env.SLIDE_RENDER_DEBUG === 'true') {
            console.log(`SlideRenderer: searchForLocalFile did not find local file for src='${s}' (baseDir='${baseDir || ''}')`);
          }
          return m;
        }
        const buf = fs.readFileSync(found);
        const mime = getMimeType(found);
        const data = `data:${mime};base64,${buf.toString('base64')}`;
        return m.replace(src, data);
      } catch (e) {
        return m;
      }
    });
  } catch (e) {
    // ignore inlining errors and fall back to original innerHtml
  }

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
