import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    let mockTargetElement: HTMLElement;

    beforeEach(() => {
        renderer = new SlideRenderer();
        vi.clearAllMocks();

        mockTargetElement = document.createElement('div');
        // Append to document.body for html-to-image to work correctly in tests
        document.body.appendChild(mockTargetElement);
    });

    afterEach(() => {
        // Clean up the mock element
        if (document.body.contains(mockTargetElement)) {
            document.body.removeChild(mockTargetElement);
        }
    });

    it('should render markdown to blob', async () => {
        const markdown = '# Test Slide';
        const blob = await renderer.render(markdown, mockTargetElement);

        expect(blob).toBeInstanceOf(Blob);
        expect(mockTargetElement.innerHTML).toContain('<h1>Test Slide</h1>');
        expect(htmlToImage.toPng).toHaveBeenCalledWith(mockTargetElement, expect.any(Object));
    });

    it('should clear targetElement content before rendering', async () => {
        mockTargetElement.innerHTML = '<div>Existing Content</div>';
        const markdown = '# New Slide';
        await renderer.render(markdown, mockTargetElement);

        expect(mockTargetElement.innerHTML).not.toContain('Existing Content');
        expect(mockTargetElement.innerHTML).toContain('<h1>New Slide</h1>');
    });
});
