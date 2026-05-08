import { FC } from 'react';
import { Column } from '../../common';
import { NotificationCenterView } from '../notification-center/NotificationCenterView';
import { RoomPromotesWidgetView } from '../room/widgets/room-promotes/RoomPromotesWidgetView';

export const RightSideView: FC<{}> = props =>
{
    return (
        <div className="nitro-right-side">
            <Column position="relative" gap={ 1 }>
                <RoomPromotesWidgetView />
                <NotificationCenterView />
            </Column>
        </div>
    );
}
