import { RoomSessionEvent } from '@nitrots/nitro-renderer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GetSessionDataManager } from '../../api';
import { useRoomSessionManagerEvent } from '../../hooks';
import { readDisplayName } from '../name-gate/useDisplayName';
import { Signaling, SignalingMessage } from './signaling';

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        // openrelay.metered.ca: public TURN, no signup. Fine for closed cohort.
        // For >free-tier traffic register at https://www.metered.ca/tools/openrelay/
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    iceCandidatePoolSize: 10
};

const SIGNALING_URL = (() =>
{
    const conf = (window as any).NitroConfig?.['webrtc.signaling.url'];
    if (conf) return conf;
    if (typeof location === 'undefined') return 'ws://localhost:8765';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        return 'ws://localhost:8765';
    return `${proto}//${location.host}/signaling`;
})();

interface PeerState
{
    pc: RTCPeerConnection;
    stream: MediaStream | null;
    audioOn: boolean;
    videoOn: boolean;
    displayName: string;
    iceQueue: RTCIceCandidateInit[];
    remoteSet: boolean;
}

export interface RemotePeer
{
    peerId: string;
    stream: MediaStream | null;
    audioOn: boolean;
    videoOn: boolean;
    displayName: string;
}

export interface WebRTCApi
{
    enabled: boolean;
    localStream: MediaStream | null;
    peers: RemotePeer[];
    audioEnabled: boolean;
    videoEnabled: boolean;
    toggleAudio: () => void;
    toggleVideo: () => void;
    threshold: number;
    setThreshold: (n: number) => void;
    autoThreshold: boolean;
    setAutoThreshold: (v: boolean) => void;
    error: string | null;
}

const FALLBACK: WebRTCApi = {
    enabled: false,
    localStream: null,
    peers: [],
    audioEnabled: true,
    videoEnabled: true,
    toggleAudio: () => {},
    toggleVideo: () => {},
    threshold: 12,
    setThreshold: () => {},
    autoThreshold: true,
    setAutoThreshold: () => {},
    error: null
};

const THRESHOLD_KEY = 'gc.audioThreshold';
const AUTO_KEY = 'gc.audioAuto';
const DEFAULT_THRESHOLD = 12;
const HANGOVER_MS = 250;
const CLOSE_RATIO = 0.6;
// Auto-mode tuning
const NOISE_FLOOR_INIT = 4;
const NOISE_FLOOR_ATTACK = 0.005;   // EMA alpha when sample looks like noise
const NOISE_FLOOR_DECAY  = 0.0008;  // EMA alpha for slow drift even during silence
const SPEECH_RATIO = 1.6;           // any sample above floor*this is "speech-ish"
const AUTO_OFFSET = 3;              // threshold = floor * SPEECH_RATIO + offset

function readThreshold(): number
{
    try {
        const raw = localStorage.getItem(THRESHOLD_KEY);
        const n = raw ? Number(raw) : NaN;
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD;
    } catch { return DEFAULT_THRESHOLD; }
}

function readAuto(): boolean
{
    try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; }
}

export function useWebRTC(): WebRTCApi
{
    const [ roomId, setRoomId ] = useState<number | null>(null);
    const [ localStream, setLocalStream ] = useState<MediaStream | null>(null);
    const [ peers, setPeers ] = useState<RemotePeer[]>([]);
    const [ audioEnabled, setAudioEnabled ] = useState(true);
    const [ videoEnabled, setVideoEnabled ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);

    const signalingRef = useRef<Signaling | null>(null);
    const peersRef = useRef<Map<string, PeerState>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const myPeerIdRef = useRef<string>('');
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gateGainRef = useRef<GainNode | null>(null);
    const thresholdRef = useRef<number>(readThreshold());
    const autoRef = useRef<boolean>(readAuto());

    const [ threshold, setThresholdState ] = useState<number>(() => readThreshold());
    const [ autoThreshold, setAutoState ] = useState<boolean>(() => readAuto());

    const setThreshold = useCallback((n: number) =>
    {
        const v = Math.max(0, Math.min(100, n));
        thresholdRef.current = v;
        setThresholdState(v);
        try { localStorage.setItem(THRESHOLD_KEY, String(v)); } catch {}
    }, []);

    const setAutoThreshold = useCallback((v: boolean) =>
    {
        autoRef.current = v;
        setAutoState(v);
        try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch {}
    }, []);

    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.STARTED, e => setRoomId(e.session.roomId));
    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.ENDED, () => setRoomId(null));

    const updatePeers = useCallback(() =>
    {
        const list: RemotePeer[] = [];
        peersRef.current.forEach((p, peerId) =>
        {
            list.push({ peerId, stream: p.stream, audioOn: p.audioOn, videoOn: p.videoOn, displayName: p.displayName });
        });
        setPeers(list);
    }, []);

    const closePeer = useCallback((peerId: string) =>
    {
        const p = peersRef.current.get(peerId);
        if (!p) return;
        try { p.pc.close(); } catch {}
        peersRef.current.delete(peerId);
        updatePeers();
    }, [ updatePeers ]);

    const createPeer = useCallback((peerId: string): PeerState =>
    {
        const existing = peersRef.current.get(peerId);
        if (existing) return existing;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        const state: PeerState = { pc, stream: null, audioOn: true, videoOn: true, displayName: '', iceQueue: [], remoteSet: false };

        if (localStreamRef.current)
            for (const track of localStreamRef.current.getTracks())
                pc.addTrack(track, localStreamRef.current);

        pc.ontrack = e =>
        {
            state.stream = e.streams[0] ?? new MediaStream([ e.track ]);
            updatePeers();
        };

        pc.onicecandidate = e =>
        {
            if (e.candidate)
                signalingRef.current?.send({ type: 'webrtc-ice', to: peerId, candidate: e.candidate.toJSON() });
        };

        pc.onconnectionstatechange = () =>
        {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed')
                closePeer(peerId);
        };

        peersRef.current.set(peerId, state);
        return state;
    }, [ closePeer, updatePeers ]);

    const flushIce = useCallback(async (state: PeerState) =>
    {
        for (const cand of state.iceQueue)
        {
            try { await state.pc.addIceCandidate(cand); } catch {}
        }
        state.iceQueue = [];
    }, []);

    const sendDisplayName = useCallback((to: string) =>
    {
        const me = readDisplayName();
        if (!me) return;
        signalingRef.current?.send({ type: 'display-name', to, name: me });
    }, []);

    const startCall = useCallback(async (peerId: string) =>
    {
        const state = createPeer(peerId);
        sendDisplayName(peerId);
        try
        {
            const offer = await state.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await state.pc.setLocalDescription(offer);
            signalingRef.current?.send({ type: 'webrtc-offer', to: peerId, offer });
        }
        catch (e)
        {
            console.error('[webrtc] startCall failed', e);
            closePeer(peerId);
        }
    }, [ createPeer, closePeer, sendDisplayName ]);

    const handleSignal = useCallback(async (msg: SignalingMessage) =>
    {
        switch (msg.type)
        {
            case 'peers':
                for (const peerId of msg.peers)
                    if (myPeerIdRef.current < peerId) startCall(peerId);
                break;
            case 'peer-joined':
                if (myPeerIdRef.current < msg.peerId) startCall(msg.peerId);
                break;
            case 'peer-left':
                closePeer(msg.peerId);
                break;
            case 'webrtc-offer':
            {
                const state = createPeer(msg.from);
                sendDisplayName(msg.from);
                try
                {
                    await state.pc.setRemoteDescription(msg.offer);
                    state.remoteSet = true;
                    await flushIce(state);
                    const answer = await state.pc.createAnswer();
                    await state.pc.setLocalDescription(answer);
                    signalingRef.current?.send({ type: 'webrtc-answer', to: msg.from, answer });
                }
                catch (e) { console.error('[webrtc] handleOffer failed', e); }
                break;
            }
            case 'webrtc-answer':
            {
                const state = peersRef.current.get(msg.from);
                if (!state) break;
                try
                {
                    await state.pc.setRemoteDescription(msg.answer);
                    state.remoteSet = true;
                    await flushIce(state);
                }
                catch (e) { console.error('[webrtc] handleAnswer failed', e); }
                break;
            }
            case 'webrtc-ice':
            {
                const state = peersRef.current.get(msg.from);
                if (!state) break;
                if (state.remoteSet)
                {
                    try { await state.pc.addIceCandidate(msg.candidate); } catch {}
                }
                else
                {
                    state.iceQueue.push(msg.candidate);
                }
                break;
            }
            case 'mute-state':
            {
                const state = peersRef.current.get(msg.from);
                if (!state) break;
                state.audioOn = msg.audio;
                state.videoOn = msg.video;
                updatePeers();
                break;
            }
            case 'display-name':
            {
                const state = peersRef.current.get(msg.from) ?? createPeer(msg.from);
                state.displayName = String(msg.name ?? '').slice(0, 32);
                updatePeers();
                break;
            }
        }
    }, [ closePeer, createPeer, flushIce, startCall, sendDisplayName, updatePeers ]);

    useEffect(() =>
    {
        if (roomId == null) return;

        let cancelled = false;

        (async () =>
        {
            try
            {
                const audioConstraints: MediaTrackConstraints = {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false,
                    channelCount: 1,
                    sampleRate: 48000
                };
                let stream: MediaStream;
                try
                {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 320, height: 240 },
                        audio: audioConstraints
                    });
                }
                catch
                {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
                }

                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

                // Insert a Web Audio noise gate between the mic and any
                // RTCPeerConnection consumers. Local stream still references
                // the gated track so the per-peer addTrack later picks it up.
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length)
                {
                    try
                    {
                        const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
                        const ctx = new Ctx();
                        audioCtxRef.current = ctx;
                        const source = ctx.createMediaStreamSource(new MediaStream([ audioTracks[0] ]));
                        const gain = ctx.createGain();
                        gain.gain.value = 0;
                        gateGainRef.current = gain;
                        const dest = ctx.createMediaStreamDestination();
                        const analyser = ctx.createAnalyser();
                        analyser.fftSize = 256;
                        analyser.smoothingTimeConstant = 0.4;
                        source.connect(analyser);
                        source.connect(gain);
                        gain.connect(dest);

                        const gatedTrack = dest.stream.getAudioTracks()[0];
                        gatedTrack.enabled = audioTracks[0].enabled;
                        stream.removeTrack(audioTracks[0]);
                        stream.addTrack(gatedTrack);

                        const buf = new Uint8Array(analyser.frequencyBinCount);
                        let raf = 0;
                        let openUntil = 0;
                        let noiseFloor = NOISE_FLOOR_INIT;
                        let lastPublishedThreshold = thresholdRef.current;
                        const tick = () =>
                        {
                            analyser.getByteFrequencyData(buf);
                            let sum = 0;
                            for (let i = 0; i < buf.length; i++) sum += buf[i];
                            const avg = sum / buf.length;

                            let t: number;
                            if (autoRef.current)
                            {
                                // Treat anything within 1.3x of current floor as noise-ish: drag floor up.
                                if (avg < noiseFloor * 1.3)
                                    noiseFloor += (avg - noiseFloor) * NOISE_FLOOR_ATTACK;
                                else
                                    noiseFloor += (avg - noiseFloor) * NOISE_FLOOR_DECAY;
                                noiseFloor = Math.max(1, Math.min(noiseFloor, 60));
                                t = noiseFloor * SPEECH_RATIO + AUTO_OFFSET;
                                if (Math.abs(t - lastPublishedThreshold) > 0.5)
                                {
                                    thresholdRef.current = t;
                                    lastPublishedThreshold = t;
                                    setThresholdState(Math.round(t));
                                }
                            }
                            else
                            {
                                t = thresholdRef.current;
                            }

                            const now = performance.now();
                            if (avg > t) openUntil = now + HANGOVER_MS;
                            const open = now < openUntil || avg > t * CLOSE_RATIO;
                            const target = open ? 1 : 0;
                            if (Math.abs(gain.gain.value - target) > 0.01)
                                gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.04);
                            raf = requestAnimationFrame(tick);
                        };
                        raf = requestAnimationFrame(tick);
                        (ctx as any)._stopTick = () => cancelAnimationFrame(raf);
                    }
                    catch (e) { console.warn('[webrtc] noise gate setup failed', e); }
                }

                localStreamRef.current = stream;
                setLocalStream(stream);

                const userId = String(GetSessionDataManager().userId);
                myPeerIdRef.current = userId;

                const signaling = new Signaling(SIGNALING_URL, String(roomId), userId);
                signalingRef.current = signaling;

                signaling.on(handleSignal);
                await signaling.connect();
            }
            catch (e: any)
            {
                console.error('[webrtc] init failed', e);
                setError(e?.message ?? String(e));
            }
        })();

        return () =>
        {
            cancelled = true;
            const sig = signalingRef.current;
            signalingRef.current = null;
            sig?.close();

            peersRef.current.forEach(p => { try { p.pc.close(); } catch {} });
            peersRef.current.clear();
            setPeers([]);

            const stream = localStreamRef.current;
            localStreamRef.current = null;
            stream?.getTracks().forEach(t => t.stop());
            setLocalStream(null);
            myPeerIdRef.current = '';

            const ctx = audioCtxRef.current;
            audioCtxRef.current = null;
            gateGainRef.current = null;
            try { (ctx as any)?._stopTick?.(); } catch {}
            try { ctx?.close(); } catch {}
        };
    }, [ roomId, handleSignal ]);

    const broadcastMuteState = useCallback((audio: boolean, video: boolean) =>
    {
        peersRef.current.forEach((_, peerId) =>
        {
            signalingRef.current?.send({ type: 'mute-state', to: peerId, audio, video });
        });
    }, []);

    const toggleAudio = useCallback(() =>
    {
        const stream = localStreamRef.current;
        if (!stream) return;
        const next = !audioEnabled;
        stream.getAudioTracks().forEach(t => { t.enabled = next; });
        setAudioEnabled(next);
        broadcastMuteState(next, videoEnabled);
    }, [ audioEnabled, videoEnabled, broadcastMuteState ]);

    const toggleVideo = useCallback(() =>
    {
        const stream = localStreamRef.current;
        if (!stream) return;
        const next = !videoEnabled;
        stream.getVideoTracks().forEach(t => { t.enabled = next; });
        setVideoEnabled(next);
        broadcastMuteState(audioEnabled, next);
    }, [ videoEnabled, audioEnabled, broadcastMuteState ]);

    if (roomId == null) return FALLBACK;
    return { enabled: true, localStream, peers, audioEnabled, videoEnabled, toggleAudio, toggleVideo, threshold, setThreshold, error };
}
