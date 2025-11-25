declare module '@cloudflare/containers' {
    export class Container {
        constructor(state: any, env: any);
        envVars: any;
        onStart(): void | Promise<void>;
        onStop(): void | Promise<void>;
        onError(error: unknown): void | Promise<void>;
    }
}