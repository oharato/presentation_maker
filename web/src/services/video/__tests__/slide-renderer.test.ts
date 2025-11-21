import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlideRenderer } from '../slide-renderer';
import * as htmlToImage from 'html-to-image';

// Mock html-to-image
vi.mock('html-to-image', () => ({
    toPng: vi.fn().mockResolvedValue('data:image/png;base64,fake-data')
}));

// Mock global fetch
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    blob: () => Promise.resolve(new Blob(['fake-png'], { type: 'image/png' }))
}));

describe('SlideRenderer', () => {
    let renderer: SlideRenderer;

    beforeEach(() => {
        renderer = new SlideRenderer();
        vi.clearAllMocks();
    });

    it('should render markdown to blob', async () => {
        const markdown = '# Test Slide';
        const blob = await renderer.render(markdown);

        expect(blob).toBeInstanceOf(Blob);
        expect(htmlToImage.toPng).toHaveBeenCalled();
    });

    it('should clean up container after render', async () => {
        const appendSpy = vi.spyOn(document.body, 'appendChild');
        const removeSpy = vi.spyOn(document.body, 'removeChild');

        await renderer.render('# Test');

        expect(appendSpy).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalled();
    });
});
