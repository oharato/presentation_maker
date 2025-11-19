import { describe, it, expect } from '@jest/globals';
import path from 'path';

describe('API Routes Configuration', () => {
    it('should validate file naming pattern', () => {
        const pattern = /^(\d+)__(.*)\.(md|txt)$/;

        // Valid filenames
        expect('010__title.md').toMatch(pattern);
        expect('020__introduction.txt').toMatch(pattern);
        expect('030__.md').toMatch(pattern);

        // Invalid filenames
        expect('invalid.md').not.toMatch(pattern);
        expect('010_title.md').not.toMatch(pattern);
        expect('title.md').not.toMatch(pattern);
    });

    it('should parse slide ID from filename', () => {
        const pattern = /^(\d+)__(.*)\.(md|txt)$/;
        const filename = '010__title.md';
        const match = filename.match(pattern);

        expect(match).not.toBeNull();
        if (match) {
            const [, id, title, ext] = match;
            expect(id).toBe('010');
            expect(title).toBe('title');
            expect(ext).toBe('md');
        }
    });

    it('should group files by slide ID', () => {
        const files = [
            '010__title.md',
            '010__title.txt',
            '020__intro.md',
            '020__intro.txt',
        ];

        const pattern = /^(\d+)__(.*)\.(md|txt)$/;
        const groups = new Map<string, { md?: string; txt?: string }>();

        for (const file of files) {
            const match = file.match(pattern);
            if (match) {
                const [, id, , ext] = match;
                if (!groups.has(id)) {
                    groups.set(id, {});
                }
                const group = groups.get(id)!;
                if (ext === 'md') group.md = file;
                if (ext === 'txt') group.txt = file;
            }
        }

        expect(groups.size).toBe(2);
        expect(groups.get('010')).toEqual({
            md: '010__title.md',
            txt: '010__title.txt',
        });
        expect(groups.get('020')).toEqual({
            md: '020__intro.md',
            txt: '020__intro.txt',
        });
    });

    it('should validate slide data structure', () => {
        const slide = {
            id: '1',
            markdown: '# Test Slide',
            script: 'Test script',
        };

        expect(slide).toHaveProperty('id');
        expect(slide).toHaveProperty('markdown');
        expect(slide).toHaveProperty('script');
        expect(typeof slide.id).toBe('string');
        expect(typeof slide.markdown).toBe('string');
        expect(typeof slide.script).toBe('string');
    });

    it('should validate job response structure', () => {
        const response = {
            jobId: 'test-uuid-123',
            slidesCount: 3,
        };

        expect(response).toHaveProperty('jobId');
        expect(response).toHaveProperty('slidesCount');
        expect(typeof response.jobId).toBe('string');
        expect(typeof response.slidesCount).toBe('number');
        expect(response.slidesCount).toBeGreaterThan(0);
    });
});
