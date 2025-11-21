import { toPng } from 'html-to-image';

export class SlideRenderer {
    async render(markdown: string): Promise<Blob> {
        console.log('[Render] Rendering slide:', markdown.substring(0, 50));

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
        container.style.padding = '60px';
        container.style.boxSizing = 'border-box';
        container.style.visibility = 'visible'; // 可視性を確保

        // 簡易的なMarkdownレンダリングとスタイリング
        const html = markdown
            .replace(/^# (.*$)/gim, '<h1 style="font-size: 72px; margin: 20px 0; color: #333; font-weight: bold; text-align: center;">$1</h1>')
            .replace(/^## (.*$)/gim, '<h2 style="font-size: 56px; margin: 16px 0; color: #444; text-align: center;">$1</h2>')
            .replace(/^\- (.*$)/gim, '<li style="font-size: 36px; margin: 10px 0; color: #555; list-style-type: none;">• $1</li>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        console.log('[Render] Generated HTML:', html);
        container.innerHTML = `<div style="width: 100%; font-family: Arial, sans-serif; color: #333; line-height: 1.6; text-align: center;">${html}</div>`;

        document.body.appendChild(container);

        try {
            console.log('[Render] Converting to PNG...');
            const dataUrl = await toPng(container, {
                width: 1280,
                height: 720,
                backgroundColor: '#ffffff',
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
