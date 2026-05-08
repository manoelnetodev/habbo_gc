import { NavigatorSearchComposer, NavigatorSearchEvent } from '@nitrots/nitro-renderer';
import { FC, useRef } from 'react';
import { CreateLinkEvent, SendMessageComposer, TryVisitRoom } from '../../api';
import gcLogo from '../../assets/images/loading/gc-logo.svg';
import { useMessageEvent } from '../../hooks';

const STUDY_ROOM_NAME = 'Estudos';

export const LandingView: FC<{}> = () =>
{
    const awaitingStudySearch = useRef(false);

    const goStudyRoom = () =>
    {
        awaitingStudySearch.current = true;
        SendMessageComposer(new NavigatorSearchComposer('myworld_view', STUDY_ROOM_NAME));
    };
    const openAvatar = () => CreateLinkEvent('avatar-editor/toggle');
    const openNavigator = () => CreateLinkEvent('navigator/toggle');

    useMessageEvent<NavigatorSearchEvent>(NavigatorSearchEvent, event =>
    {
        if(!awaitingStudySearch.current) return;

        awaitingStudySearch.current = false;

        const parser = event.getParser();
        const target = STUDY_ROOM_NAME.toLowerCase();

        for(const list of parser.result.results)
        {
            for(const room of list.rooms)
            {
                if(room.roomName.toLowerCase() === target)
                {
                    TryVisitRoom(room.roomId);
                    return;
                }
            }
        }
    });

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
