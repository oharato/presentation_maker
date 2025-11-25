jest.mock('marked', () => ({
    marked: {
        parse: jest.fn().mockReturnValue('<h1>Title</h1>')
    }
}));

import { SlideRenderer } from '../../src/services/slide_renderer';
import puppeteer from 'puppeteer';

jest.mock('puppeteer');

describe('SlideRenderer', () => {
    let renderer: SlideRenderer;
    const mockedPuppeteer = puppeteer as jest.Mocked<typeof puppeteer>;

    beforeEach(() => {
        renderer = new SlideRenderer();
        jest.clearAllMocks();
    });

    it('should render slide to image', async () => {
        const mockPage = {
            setContent: jest.fn(),
            setViewport: jest.fn(),
            screenshot: jest.fn(),
            close: jest.fn(),
        };
        const mockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
            close: jest.fn(),
        };

        mockedPuppeteer.launch.mockResolvedValue(mockBrowser as any);

        await renderer.renderSlide('# Title', 'output.png');

        expect(mockedPuppeteer.launch).toHaveBeenCalled();
        expect(mockBrowser.newPage).toHaveBeenCalled();
        expect(mockPage.setContent).toHaveBeenCalledWith(expect.stringContaining('<h1>Title</h1>'));
        expect(mockPage.screenshot).toHaveBeenCalledWith(expect.objectContaining({ path: 'output.png' }));
        expect(mockBrowser.close).toHaveBeenCalled();
    });
});
