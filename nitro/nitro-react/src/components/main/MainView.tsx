import { HabboWebTools, ILinkEventTracker, RoomSessionEvent } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, GetCommunication, RemoveLinkEventTracker } from '../../api';
import { Base } from '../../common';
import { useRoomSessionManagerEvent } from '../../hooks';
import { AvatarEditorView } from '../avatar-editor/AvatarEditorView';
import { CatalogView } from '../catalog/CatalogView';
import { ChatHistoryView } from '../chat-history/ChatHistoryView';
import { FloorplanEditorView } from '../floorplan-editor/FloorplanEditorView';
import { InventoryView } from '../inventory/InventoryView';
import { LandingView } from '../landing/LandingView';
import { NameGate } from '../name-gate/NameGate';
import { NavigatorView } from '../navigator/NavigatorView';
import { RightSideView } from '../right-side/RightSideView';
import { RoomView } from '../room/RoomView';
import { ToolbarView } from '../toolbar/ToolbarView';
import { UserProfileView } from '../user-profile/UserProfileView';
import { UserSettingsView } from '../user-settings/UserSettingsView';
import { WebRTCPanel } from '../webrtc/WebRTCPanel';

export const MainView: FC<{}> = props =>
{
    const [ isReady, setIsReady ] = useState(false);
    const [ landingViewVisible, setLandingViewVisible ] = useState(true);

    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.CREATED, event => setLandingViewVisible(false));
    useRoomSessionManagerEvent<RoomSessionEvent>(RoomSessionEvent.ENDED, event => setLandingViewVisible(event.openLandingView));

    useEffect(() =>
    {
        setIsReady(true);

        GetCommunication().connection.onReady();
    }, []);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = { 
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');
        
                if(parts.length < 2) return;
        
                switch(parts[1])
                {
                    case 'open':
                        if(parts.length > 2)
                        {
                            switch(parts[2])
                            {
                                case 'credits':
                                    //HabboWebTools.openWebPageAndMinimizeClient(this._windowManager.getProperty(ExternalVariables.WEB_SHOP_RELATIVE_URL));
                                    break;
                                default: {
                                    const name = parts[2];
                                    HabboWebTools.openHabblet(name);
                                }
                            }
                        }
                        return;
                }
            },
            eventUrlPrefix: 'habblet/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    return (
        <Base fit>
            <NameGate />
            { landingViewVisible && <LandingView /> }
            <ToolbarView isInRoom={ !landingViewVisible } />
            <RoomView />
            <ChatHistoryView />
            <AvatarEditorView />
            <NavigatorView />
            <CatalogView />
            <InventoryView />
            <RightSideView />
            <UserSettingsView />
            <UserProfileView />
            <FloorplanEditorView />
            <WebRTCPanel />
        </Base>
    );
}
