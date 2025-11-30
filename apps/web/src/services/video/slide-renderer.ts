import { toPng } from 'html-to-image';
import { marked } from 'marked';

const SLIDE_STYLE_ID = 'slide-renderer-styles';

export class SlideRenderer {
    async render(markdown: string, targetElement?: HTMLElement): Promise<Blob> {
        console.log('[Render] Rendering slide:', markdown.substring(0, 50));
        const htmlContent = (await marked.parse(markdown)).replace(/<!--[\s\S]*?-->/g, '');
        console.log('[Render] Generated HTML:', htmlContent);

        let styleElement = document.getElementById(SLIDE_STYLE_ID) as HTMLStyleElement;
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = SLIDE_STYLE_ID;
            document.head.appendChild(styleElement);
        }
        styleElement.textContent = `
            .slide-preview-container {
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
            .slide-content ul { text-align: left; display: block; margin: 0 0 16px 0; padding-left: 40px; list-style-position: outside; }
            .slide-content li, .slide-content ul li { display: block; margin-bottom: 14px; }
            .slide-content ul ul { margin-left: 24px; margin-top: 8px; }
            .slide-content p { margin-bottom: 20px; }
        `;


        // targetElement が渡されていなければオフスクリーンで一時コンテナを作る
        const createdContainer = !targetElement;
        const container = targetElement ?? document.createElement('div');

        if (createdContainer) {
            // 画面に表示せずにレンダリングできるように目に見えない位置に配置
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '0';
            container.style.width = '1280px';
            container.style.height = '720px';
            document.body.appendChild(container);
        }

        // 既存のコンテンツをクリアし、マークダウンから生成されたHTMLを挿入
        container.innerHTML = '';
        container.className = 'slide-preview-container'; // スタイルを適用するためにクラスを設定

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'slide-content';
        contentWrapper.innerHTML = htmlContent;
        container.appendChild(contentWrapper);

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
            // targetElement が渡されなかった場合、自分で作った一時コンテナを削除
            if (createdContainer) {
                try {
                    document.body.removeChild(container);
                } catch (e) {
                    // ignore
                }
            }
        }
    }
}
