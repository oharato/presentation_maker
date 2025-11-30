// @ts-nocheck
// `fs` and `path` are Node built-ins used at runtime by the core renderer.
// Use dynamic require so this module can be imported in browser/tooling
// (vue-tsc / vite) without TypeScript trying to resolve Node-only types.
declare const require: any;
let fs: any;
let path: any;
try {
  fs = require('fs');
  path = require('path');
} catch (e) {
  fs = undefined;
  path = undefined;
}

export const SLIDE_STYLE_ID = 'slide-renderer-styles';
export const SLIDE_PREVIEW_CLASS = 'slide-preview-container';
export const SLIDE_CONTENT_CLASS = 'slide-content';

export const SLIDE_CSS = `
.${SLIDE_PREVIEW_CLASS} {
  /* Match target video/frame resolution so the slide fills the 1920x1080 viewport */
  width: 1920px;
  height: 1080px;
  display: flex;
  flex-direction: column;
  /* Center by default so slides like preface/title stay vertically centered */
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  /* provide modest padding so very large headings don't touch the top edge */
  padding-top: 40px;
  padding-left: 60px;
  padding-right: 60px;
  box-sizing: border-box;
  overflow: hidden;
}
.${SLIDE_CONTENT_CLASS} {
  width: 100%;
  /* widen content area to give more horizontal space for bulleted lists/images */
  max-width: 1500px;
  margin: 0 auto;
  text-align: center;
  font-family: 'Noto Sans CJK JP', 'Noto Sans JP', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #333;
  font-size: 32px;
  line-height: 1.5;
  /* vertically center inner content while respecting container padding */
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-height: calc(100% - 80px);
  box-sizing: border-box;
}
.slide-content [style*="min-height"] {
    /* Neutralize any inline fullscreen min-height that child content may set
      (e.g. min-height:100vh) so it doesn't overflow the slide frame and
      force top-alignment. */
  min-height: auto !important;
  max-height: calc(100% - 80px) !important;
  overflow: auto !important;
}
.slide-content > div[style*="display:flex"] {
  /* If a direct child uses a two-column flex with height rules, make it
     fit the slide content area and vertically center its items. */
  align-items: center !important;
}
.${SLIDE_CONTENT_CLASS} h1 { font-size: 80px; margin-bottom: 40px; color: #000; font-weight: bold; }
.${SLIDE_CONTENT_CLASS} h2 { font-size: 54px; margin-bottom: 26px; color: #444; font-weight: bold; }
.${SLIDE_CONTENT_CLASS} ul { text-align: left; display: block; margin: 0 0 16px 0; padding-left: 28px; list-style-position: inside; list-style-type: disc; }
.${SLIDE_CONTENT_CLASS} li, .${SLIDE_CONTENT_CLASS} ul li { display: list-item; margin-bottom: 14px; }
.${SLIDE_CONTENT_CLASS} ul ul { margin-left: 20px; margin-top: 8px; }
.${SLIDE_CONTENT_CLASS} p { margin-bottom: 20px; }
`;

function getMimeType(fp: string) {
  let ext = '';
  try {
    if (path && typeof (path as any).extname === 'function') {
      ext = (path as any).extname(fp).toLowerCase();
    } else {
      const m = fp.match(/\.([^.?#/\\]+)(?:[?#].*)?$/);
      ext = m ? `.${m[1].toLowerCase()}` : '';
    }
  } catch (e) {
    ext = '';
  }

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
      if (!fs || !path) return startDir;
      const fsLocal = fs as any;
      const pathLocal = path as any;
      let dir = startDir;
      let lastWithPackageJson: string | null = null;
      while (true) {
        try {
          const hasPnpmWorkspace = fsLocal.existsSync(pathLocal.join(dir, 'pnpm-workspace.yaml'));
          const hasGit = fsLocal.existsSync(pathLocal.join(dir, '.git'));
          const hasPackageJson = fsLocal.existsSync(pathLocal.join(dir, 'package.json'));

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

    const cwd = (globalThis as any).process && typeof (globalThis as any).process.cwd === 'function'
      ? (globalThis as any).process.cwd()
      : '.';
    const repoRoot = findRepoRoot(cwd);
    const defaultBase = path ? path.join(repoRoot, 'input') : 'input';
    if ((globalThis as any).process?.env?.SLIDE_RENDER_DEBUG === 'true') {
      console.log(`SlideRenderer: repoRoot=${repoRoot}, defaultBase=${defaultBase}`);
    }

    function searchForLocalFile(srcPath: string, preferredBase?: string) {
      const tried: string[] = [];

      const candidates = [] as string[];
      try {
        if (preferredBase && path) candidates.push(path.resolve(preferredBase, srcPath));
        if (path && (globalThis as any).process && typeof (globalThis as any).process.cwd === 'function') {
          candidates.push(path.resolve((globalThis as any).process.cwd(), srcPath));
        }
        if (path) candidates.push(path.resolve(defaultBase, srcPath));
      } catch (e) {
        // ignore candidate resolution errors
      }

      if ((globalThis as any).process?.env?.SLIDE_RENDER_DEBUG === 'true') {
        console.log(`SlideRenderer: searchForLocalFile candidates for '${srcPath}': ${JSON.stringify(candidates)}`);
      }

      for (const c of candidates) {
        tried.push(c);
        try {
          if (fs && fs.existsSync && fs.existsSync(c)) {
            if ((globalThis as any).process?.env?.SLIDE_RENDER_DEBUG === 'true') {
              console.log(`SlideRenderer: searchForLocalFile found file candidate: ${c}`);
            }
            return c;
          }
        } catch (e) {
          // ignore fs errors for candidates
        }
      }

      // Last resort: search by basename under repo (limited, skipping node_modules/.git/output)
      const basename = path ? path.basename(srcPath) : srcPath;
      const root = (globalThis as any).process && typeof (globalThis as any).process.cwd === 'function'
        ? (globalThis as any).process.cwd()
        : '.';
      const skipDirs = new Set(['node_modules', '.git', 'output', 'dist', 'build']);

      const stack = [root];
      let depth = 0;
      while (stack.length && depth < 5) {
        const dir = stack.pop();
        if (!dir) break;
        try {
          const items = fs && fs.readdirSync ? fs.readdirSync(dir) : [];
          for (const it of items) {
            const full = (path as any).join(dir, it);
            try {
              const st = fs && fs.statSync ? fs.statSync(full) : undefined;
              if (st && st.isFile && st.isFile() && it === basename) {
                return full;
              }
              if (st && st.isDirectory && st.isDirectory() && !skipDirs.has(it)) {
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
          if ((globalThis as any).process?.env?.SLIDE_RENDER_DEBUG === 'true') {
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
        padding: 0;
        box-sizing: border-box;
        font-size: 48px;
        overflow: hidden;
      }
      /* Center a content column but ensure the actual slide preview uses the
         exact frame size (1920x1080) so rendered PNGs are full-frame slides. */
      .content { width: 100%; display: flex; justify-content: center; }
      ${SLIDE_CSS}
    </style>
  </head>
  <body>
    <div class="content">
      <div class="${SLIDE_PREVIEW_CLASS}">
        <div class="${SLIDE_CONTENT_CLASS}">
          ${innerHtml}
        </div>
      </div>
    </div>
  </body>
  </html>`;
}
