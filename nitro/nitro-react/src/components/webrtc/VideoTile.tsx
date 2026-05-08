import { FC, useEffect, useRef } from 'react';
import { useSpeaking } from './useSpeaking';

interface VideoTileProps
{
    stream: MediaStream | null;
    label: string;
    muted?: boolean;
    audioOn?: boolean;
    videoOn?: boolean;
    self?: boolean;
}

export const VideoTile: FC<VideoTileProps> = ({ stream, label, muted = false, audioOn = true, videoOn = true, self = false }) =>
{
    const videoRef = useRef<HTMLVideoElement>(null);
    const { level, speaking } = useSpeaking(audioOn ? stream : null);

    useEffect(() =>
    {
        const el = videoRef.current;
        if (!el) return;
        if (el.srcObject !== stream) el.srcObject = stream;
    }, [ stream ]);

    const meterPct = Math.min(100, Math.round((level / 80) * 100));

    return (
        <div className={ `gc-tile ${ self ? 'is-self' : '' } ${ !videoOn ? 'is-cam-off' : '' } ${ speaking ? 'is-speaking' : '' }` }>
            <video ref={ videoRef } autoPlay playsInline muted={ muted || self } />
            { !videoOn && <div className="gc-tile-camoff">📷</div> }
            { audioOn && (
                <div className="gc-tile-meter">
                    <div className="gc-tile-meter-fill" style={ { width: `${ meterPct }%` } } />
                </div>
            ) }
            <div className="gc-tile-label">
                <span>{ label }</span>
                { !audioOn && <span className="gc-tile-mute" title="Mudo">🔇</span> }
            </div>
        </div>
    );
};
