export default {};
export const promises = {};
export function readFileSync() { return null; }
export function writeFileSync() { return null; }
export function existsSync() { return false; }
export function mkdirSync() { return null; }
export function join(...args) { return args.join('/'); }
export function dirname(path) { return path.split('/').slice(0, -1).join('/'); }
export function basename(path) { return path.split('/').pop(); }
export function extname(path) { const parts = path.split('.'); return parts.length > 1 ? '.' + parts.pop() : ''; }
