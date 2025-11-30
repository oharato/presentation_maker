import { toPng } from 'html-to-image';
import { marked } from 'marked';
import { SLIDE_STYLE_ID, SLIDE_CSS, SLIDE_PREVIEW_CLASS, SLIDE_CONTENT_CLASS } from '../../../../../packages/core/src/services/slide_template';

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
        styleElement.textContent = SLIDE_CSS;


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

        container.className = SLIDE_PREVIEW_CLASS; // スタイルを適用するためにクラスを設定

        const contentWrapper = document.createElement('div');
        contentWrapper.className = SLIDE_CONTENT_CLASS;
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
