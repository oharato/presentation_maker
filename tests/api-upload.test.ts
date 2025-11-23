/**
 * API Routes のテスト (ファイルアップロード部分)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('API Routes - File Upload', () => {
    describe('File type filtering', () => {
        it('should filter out non-File entries from FormData', () => {
            // FormData.getAll() の戻り値をシミュレート
            const mockEntries: (string | File)[] = [
                new File(['content1'], 'slide1.md', { type: 'text/markdown' }),
                'string-value', // これは除外されるべき
                new File(['content2'], 'slide2.txt', { type: 'text/plain' }),
            ];

            // フィルタリングロジックのテスト
            const files = mockEntries.filter((f): f is File => f instanceof File);

            expect(files).toHaveLength(2);
            expect(files[0]).toBeInstanceOf(File);
            expect(files[0].name).toBe('slide1.md');
            expect(files[1]).toBeInstanceOf(File);
            expect(files[1].name).toBe('slide2.txt');
        });

        it('should return empty array when no Files present', () => {
            const mockEntries: (string | File)[] = [
                'string1',
                'string2',
            ];

            const files = mockEntries.filter((f): f is File => f instanceof File);

            expect(files).toHaveLength(0);
        });

        it('should handle empty array', () => {
            const mockEntries: (string | File)[] = [];

            const files = mockEntries.filter((f): f is File => f instanceof File);

            expect(files).toHaveLength(0);
        });
    });

    describe('Slide filename parsing', () => {
        it('should parse valid slide filename', () => {
            const filename = '010__title.md';
            const match = filename.match(/^(\d+)__(.+)\.(md|txt)$/);

            expect(match).not.toBeNull();
            expect(match![1]).toBe('010');
            expect(match![2]).toBe('title');
            expect(match![3]).toBe('md');
        });

        it('should parse script filename', () => {
            const filename = '020__introduction.txt';
            const match = filename.match(/^(\d+)__(.+)\.(md|txt)$/);

            expect(match).not.toBeNull();
            expect(match![1]).toBe('020');
            expect(match![2]).toBe('introduction');
            expect(match![3]).toBe('txt');
        });

        it('should reject invalid filename format', () => {
            const invalidFilenames = [
                'slide.md',
                '010_title.md',
                '010__title.pdf',
                'title__010.md',
            ];

            invalidFilenames.forEach(filename => {
                const match = filename.match(/^(\d+)__(.+)\.(md|txt)$/);
                expect(match).toBeNull();
            });
        });
    });
});
