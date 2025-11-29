import { toPng } from 'html-to-image';
import { marked } from 'marked';

export class SlideRenderer {
    async render(markdown: string): Promise<Blob> {
        console.log('[Render] Rendering slide:', markdown.substring(0, 50));
        const htmlContent = await marked.parse(markdown);

        // レンダリング用の一時コンテナを作成
        const container = document.createElement('div');
        container.style.width = '1280px';
        container.style.height = '720px';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.zIndex = '-1000'; // 画面外ではなく、最背面配置
        container.style.backgroundColor = '#f0f0f0'; // レンダリング確認用の背景色
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.padding = '50px'; // Scaled from 80px
        container.style.boxSizing = 'border-box';
        container.style.visibility = 'visible'; // 可視性を確保

        // Backend styling scaled down for 1280x720 (approx 0.67x of 1920x1080)
        // Original: font-size 48, h1 120, h2 80, li margin 20
        const style = `
            <style>
                .slide-content {
                    width: 100%;
                    max-width: 1060px;
                    text-align: center;
                    font-family: 'Noto Sans CJK JP', 'Noto Sans JP', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    color: #333;
                    font-size: 32px; 
                    line-height: 1.5;
                }
                .slide-content h1 { font-size: 80px; margin-bottom: 40px; color: #000; font-weight: bold; }
                .slide-content h2 { font-size: 54px; margin-bottom: 26px; color: #444; font-weight: bold; }
                .slide-content ul { text-align: left; display: inline-block; margin: 0; padding-left: 40px; }
                .slide-content li { margin-bottom: 14px; }
                .slide-content p { margin-bottom: 20px; }
            </style>
        `;

        container.innerHTML = `
            ${style}
            <div class="slide-content">
                ${htmlContent}
            </div>
        `;

        document.body.appendChild(container);

        try {
            console.log('[Render] Converting to PNG...');
            const dataUrl = await toPng(container, {
                width: 1280,
                height: 720,
                backgroundColor: '#f0f0f0',
                pixelRatio: 1
            });
            const blob = await fetch(dataUrl).then(res => res.blob());
            console.log('[Render] PNG created, size:', blob.size, 'bytes');
            return blob;
        } finally {
            document.body.removeChild(container);
        }
    }
}
