import { FC } from 'react';
import { CreateLinkEvent, TryVisitRoom } from '../../api';
import gcLogo from '../../assets/images/loading/gc-logo.svg';

export const LandingView: FC<{}> = () =>
{
    const goStudyRoom = () => TryVisitRoom(50);
    const openAvatar = () => CreateLinkEvent('avatar-editor/toggle');
    const openNavigator = () => CreateLinkEvent('navigator/toggle');

    return (
        <div className="gc-landing">
            <img src={ gcLogo } alt="logo" className="gc-landing-logo" />
            <h1 className="gc-landing-title">Bem-vindo</h1>
            <p className="gc-landing-subtitle">Escolha por onde começar</p>

            <div className="gc-landing-grid">
                <button className="gc-landing-card" onClick={ goStudyRoom }>
                    <span className="gc-landing-card-icon">📚</span>
                    <span className="gc-landing-card-title">Sala de Estudos</span>
                    <span className="gc-landing-card-sub">Entrar agora</span>
                </button>
                <button className="gc-landing-card" onClick={ openNavigator }>
                    <span className="gc-landing-card-icon">🗺️</span>
                    <span className="gc-landing-card-title">Todas as salas</span>
                    <span className="gc-landing-card-sub">Abrir navegador</span>
                </button>
                <button className="gc-landing-card" onClick={ openAvatar }>
                    <span className="gc-landing-card-icon">🧍</span>
                    <span className="gc-landing-card-title">Meu personagem</span>
                    <span className="gc-landing-card-sub">Editar avatar</span>
                </button>
            </div>
        </div>
    );
}
