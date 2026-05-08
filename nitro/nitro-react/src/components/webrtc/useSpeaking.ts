import { useEffect, useState } from 'react';

const SPEAKING_THRESHOLD = 12;
const SMOOTHING = 0.5;

/**
 * Wires a MediaStream's audio track into a Web Audio analyser and returns
 *  - level: smoothed RMS-ish value 0..255
 *  - speaking: true when the smoothed level crosses SPEAKING_THRESHOLD
 */
export function useSpeaking(stream: MediaStream | null): { level: number; speaking: boolean }
{
    const [ level, setLevel ] = useState(0);
    const [ speaking, setSpeaking ] = useState(false);

    useEffect(() =>
    {
        if (!stream) { setLevel(0); setSpeaking(false); return; }
        const tracks = stream.getAudioTracks();
        if (!tracks.length) { setLevel(0); setSpeaking(false); return; }

        const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;

        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = SMOOTHING;
        source.connect(analyser);

        const buf = new Uint8Array(analyser.frequencyBinCount);
        let raf = 0;
        let last = 0;

        const loop = () =>
        {
            analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i];
            const avg = sum / buf.length;
            // Throttle React updates to ~10Hz to avoid hammering reconciliation
            const now = performance.now();
            if (now - last > 100)
            {
                last = now;
                setLevel(avg);
                setSpeaking(avg > SPEAKING_THRESHOLD);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        return () =>
        {
            cancelAnimationFrame(raf);
            try { source.disconnect(); } catch {}
            try { analyser.disconnect(); } catch {}
            try { ctx.close(); } catch {}
        };
    }, [ stream ]);

    return { level, speaking };
}
