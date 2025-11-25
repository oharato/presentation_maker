/**
 * Durable Objects: ジョブ管理とWebSocket接続管理
 */

import type { Env } from '../api/types';

export class JobManager implements DurableObject {
    state: DurableObjectState;
    sessions: Map<string, WebSocket>;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map();
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // WebSocket接続
        if (request.headers.get('Upgrade') === 'websocket') {
            return this.handleWebSocket(request);
        }

        // ジョブステータス取得
        if (url.pathname.startsWith('/jobs/')) {
            const jobId = url.pathname.split('/')[2];
            return this.getJobStatus(jobId);
        }

        // ジョブステータス更新
        if (url.pathname.startsWith('/update/')) {
            const jobId = url.pathname.split('/')[2];
            const data = await request.json();
            return this.updateJobStatus(jobId, data);
        }

        // ジョブキュー追加
        if (url.pathname === '/queue/add') {
            const job = await request.json();
            return this.enqueueJob(job);
        }

        // 次のジョブ取得
        if (url.pathname === '/queue/next') {
            return this.dequeueJob();
        }

        return new Response('Not found', { status: 404 });
    }

    /**
     * WebSocket接続処理
     */
    private handleWebSocket(_request: Request): Response {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // WebSocketセッション管理
        this.acceptWebSocket(server);

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    }

    /**
     * WebSocketセッション受け入れ
     */
    private async acceptWebSocket(websocket: WebSocket) {
        websocket.accept();
        const sessionId = crypto.randomUUID();
        this.sessions.set(sessionId, websocket);

        console.log(`WebSocket session started: ${sessionId}`);

        // メッセージ受信
        websocket.addEventListener('message', async (event) => {
            try {
                const data = JSON.parse(event.data as string);
                await this.handleMessage(sessionId, data);
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        });

        // 接続終了
        websocket.addEventListener('close', () => {
            console.log(`WebSocket session closed: ${sessionId}`);
            this.sessions.delete(sessionId);
        });

        // エラー処理
        websocket.addEventListener('error', (event) => {
            console.error(`WebSocket error: ${sessionId}`, event);
            this.sessions.delete(sessionId);
        });
    }

    /**
     * WebSocketメッセージ処理
     */
    private async handleMessage(sessionId: string, data: any) {
        const { type, payload } = data;

        switch (type) {
            case 'join:job':
                // ジョブルームに参加
                await this.joinJobRoom(sessionId, payload.jobId);
                break;

            case 'ping':
                // ハートビート
                const ws = this.sessions.get(sessionId);
                if (ws) {
                    ws.send(JSON.stringify({ type: 'pong' }));
                }
                break;

            default:
                console.warn(`Unknown message type: ${type}`);
        }
    }

    /**
     * ジョブルームに参加
     */
    private async joinJobRoom(sessionId: string, jobId: string) {
        const ws = this.sessions.get(sessionId);
        if (!ws) return;

        // セッションにジョブIDを紐付け
        await this.state.storage.put(`session:${sessionId}:jobId`, jobId);

        // 現在のジョブステータスを送信
        const status = await this.state.storage.get(`job:${jobId}`);
        if (status) {
            ws.send(JSON.stringify({
                type: 'job:status',
                payload: status,
            }));
        }

        ws.send(JSON.stringify({
            type: 'joined',
            payload: { jobId },
        }));
    }

    /**
     * ジョブステータス取得
     */
    private async getJobStatus(jobId: string): Promise<Response> {
        const status = await this.state.storage.get(`job:${jobId}`);

        if (!status) {
            return new Response(JSON.stringify({ error: 'Job not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify(status), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * ジョブステータス更新
     */
    private async updateJobStatus(jobId: string, data: any): Promise<Response> {
        // ステータスを保存
        await this.state.storage.put(`job:${jobId}`, {
            ...data,
            updatedAt: new Date().toISOString(),
        });

        // 関連するWebSocketセッションに通知
        const eventType = data.status === 'completed' ? 'job:completed' :
            data.status === 'failed' ? 'job:failed' : 'job:progress';

        await this.broadcastToJob(jobId, {
            type: eventType,
            payload: data,
        });

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * ジョブをキューに追加
     */
    private async enqueueJob(job: any): Promise<Response> {
        const { jobId } = job;

        // ジョブデータを保存
        await this.state.storage.put(`job:${jobId}`, {
            ...job,
            status: 'pending',
            createdAt: new Date().toISOString(),
        });

        // キューリストに追加
        let queue = await this.state.storage.get<string[]>('queue') || [];
        if (!queue.includes(jobId)) {
            queue.push(jobId);
            await this.state.storage.put('queue', queue);
        }

        console.log(`Job enqueued: ${jobId}, Queue length: ${queue.length}`);

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * 次のジョブを取得 (Dequeue)
     */
    private async dequeueJob(): Promise<Response> {
        let queue = await this.state.storage.get<string[]>('queue') || [];

        if (queue.length === 0) {
            return new Response(null, { status: 204 }); // No Content
        }

        const jobId = queue.shift(); // 先頭から取得
        await this.state.storage.put('queue', queue);

        if (!jobId) {
            return new Response(null, { status: 204 });
        }

        const job = await this.state.storage.get(`job:${jobId}`);

        if (!job) {
            // データがない場合は次へ (再帰的だが、通常はありえない)
            return this.dequeueJob();
        }

        console.log(`Job dequeued: ${jobId}, Remaining: ${queue.length}`);

        return new Response(JSON.stringify(job), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * 特定のジョブに関連する全セッションにブロードキャスト
     */
    private async broadcastToJob(jobId: string, message: any) {
        const sessions = Array.from(this.sessions.entries());

        for (const [sessionId, ws] of sessions) {
            const sessionJobId = await this.state.storage.get(`session:${sessionId}:jobId`);

            if (sessionJobId === jobId) {
                try {
                    ws.send(JSON.stringify(message));
                } catch (error) {
                    console.error(`Failed to send to session ${sessionId}:`, error);
                }
            }
        }
    }

    /**
     * アラーム処理 (定期クリーンアップなど)
     */
    async alarm() {
        // 古いジョブステータスをクリーンアップ
        const keys = await this.state.storage.list({ prefix: 'job:' });
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24時間

        for (const [key, value] of keys) {
            const job = value as any;
            const updatedAt = new Date(job.updatedAt).getTime();

            if (now - updatedAt > maxAge) {
                await this.state.storage.delete(key);
                console.log(`Cleaned up old job: ${key}`);
            }
        }

        // 次回のアラームをセット (1時間後)
        await this.state.storage.setAlarm(Date.now() + 60 * 60 * 1000);
    }
}
