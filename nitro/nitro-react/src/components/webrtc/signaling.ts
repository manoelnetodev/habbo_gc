export type SignalingMessage =
    | { type: 'peers'; peers: string[] }
    | { type: 'peer-joined'; peerId: string }
    | { type: 'peer-left'; peerId: string }
    | { type: 'webrtc-offer'; from: string; to: string; offer: RTCSessionDescriptionInit }
    | { type: 'webrtc-answer'; from: string; to: string; answer: RTCSessionDescriptionInit }
    | { type: 'webrtc-ice'; from: string; to: string; candidate: RTCIceCandidateInit }
    | { type: 'mute-state'; from: string; to: string; audio: boolean; video: boolean }
    | { type: 'display-name'; from: string; to: string; name: string }
    | { type: 'pong' };

type Listener = (msg: SignalingMessage) => void;

export class Signaling
{
    private ws: WebSocket | null = null;
    private listeners = new Set<Listener>();
    private pingTimer: ReturnType<typeof setInterval> | null = null;

    constructor(private url: string, private roomId: string, private peerId: string) {}

    connect(): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            const sep = this.url.includes('?') ? '&' : '?';
            const fullUrl = `${this.url}${sep}roomId=${encodeURIComponent(this.roomId)}&peerId=${encodeURIComponent(this.peerId)}`;
            const ws = new WebSocket(fullUrl);
            this.ws = ws;

            ws.addEventListener('open', () =>
            {
                this.pingTimer = setInterval(() =>
                {
                    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
                }, 25000);
                resolve();
            });

            ws.addEventListener('error', err => reject(err));

            ws.addEventListener('message', e =>
            {
                let msg: SignalingMessage;
                try { msg = JSON.parse(e.data); } catch { return; }
                this.listeners.forEach(l => l(msg));
            });
        });
    }

    on(listener: Listener): () => void
    {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    send(msg: object): void
    {
        if (this.ws && this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
    }

    close(): void
    {
        this.listeners.clear();
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (this.ws) this.ws.close();
        this.ws = null;
    }
}
