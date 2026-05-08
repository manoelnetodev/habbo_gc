import { FC, useState } from 'react';
import { readDisplayName } from '../name-gate/useDisplayName';
import { useWebRTC } from './useWebRTC';
import { VideoTile } from './VideoTile';

export const WebRTCPanel: FC<{}> = () =>
{
    const { enabled, localStream, peers, audioEnabled, videoEnabled, toggleAudio, toggleVideo, threshold, setThreshold, error } = useWebRTC();
    const [ tunerOpen, setTunerOpen ] = useState(false);

    if (!enabled) return null;

    const myName = readDisplayName() || 'Você';

    return (
        <div className="gc-webrtc-panel">
            <div className="gc-webrtc-tiles">
                <VideoTile stream={ localStream } label={ myName } self audioOn={ audioEnabled } videoOn={ videoEnabled } />
                { peers.map(p => (
                    <VideoTile key={ p.peerId } stream={ p.stream } label={ p.displayName || `#${ p.peerId }` } audioOn={ p.audioOn } videoOn={ p.videoOn } />
                )) }
            </div>
            <div className="gc-webrtc-controls">
                <button className={ `gc-webrtc-btn ${ audioEnabled ? '' : 'is-off' }` } onClick={ toggleAudio } title={ audioEnabled ? 'Mutar microfone' : 'Ativar microfone' }>
                    { audioEnabled ? '🎤' : '🔇' }
                </button>
                <button className={ `gc-webrtc-btn ${ videoEnabled ? '' : 'is-off' }` } onClick={ toggleVideo } title={ videoEnabled ? 'Desligar câmera' : 'Ligar câmera' }>
                    { videoEnabled ? '🎥' : '📷' }
                </button>
                <button className={ `gc-webrtc-btn ${ tunerOpen ? 'is-on' : '' }` } onClick={ () => setTunerOpen(o => !o) } title="Sensibilidade do microfone">
                    🎚
                </button>
            </div>
            { tunerOpen && (
                <div className="gc-webrtc-tuner">
                    <div className="gc-webrtc-tuner-label">
                        <span>Tolerância</span>
                        <span className="gc-webrtc-tuner-value">{ threshold.toFixed(0) }</span>
                    </div>
                    <input
                        type="range"
                        min={ 0 }
                        max={ 60 }
                        step={ 1 }
                        value={ threshold }
                        onChange={ e => setThreshold(Number(e.target.value)) }
                    />
                    <div className="gc-webrtc-tuner-hint">Mais alto = só voz forte passa.</div>
                </div>
            ) }
            { error && <div className="gc-webrtc-error">{ error }</div> }
        </div>
    );
};
