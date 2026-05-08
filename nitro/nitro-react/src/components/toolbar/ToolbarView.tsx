import { FC, useState } from 'react';
import { CreateLinkEvent, VisitDesktop } from '../../api';
import { Base, Flex, LayoutAvatarImageView, TransitionAnimation, TransitionAnimationTypes } from '../../common';
import { useSessionInfo } from '../../hooks';
import { ToolbarMeView } from './ToolbarMeView';

export const ToolbarView: FC<{ isInRoom: boolean }> = props =>
{
    const { isInRoom } = props;
    const [ isMeExpanded, setMeExpanded ] = useState(false);
    const { userFigure = null } = useSessionInfo();

    return (
        <>
            <TransitionAnimation type={ TransitionAnimationTypes.FADE_IN } inProp={ isMeExpanded } timeout={ 300 }>
                <ToolbarMeView setMeExpanded={ setMeExpanded } />
            </TransitionAnimation>
            <Flex alignItems="center" justifyContent="between" gap={ 2 } className="nitro-toolbar py-1 px-3">
                <Flex gap={ 2 } alignItems="center">
                    <Flex alignItems="center" gap={ 2 }>
                        <Flex center pointer className={ 'navigation-item item-avatar ' + (isMeExpanded ? 'active ' : '') } onClick={ event => setMeExpanded(!isMeExpanded) }>
                            <LayoutAvatarImageView figure={ userFigure } direction={ 2 } position="absolute" />
                        </Flex>
                        { isInRoom &&
                            <Base pointer className="navigation-item icon icon-habbo" onClick={ event => VisitDesktop() } /> }
                        { !isInRoom &&
                            <Base pointer className="navigation-item icon icon-house" onClick={ event => CreateLinkEvent('navigator/goto/home') } /> }
                        <Base pointer className="navigation-item icon icon-rooms" onClick={ event => CreateLinkEvent('navigator/toggle') } />
                    </Flex>
                    <Flex alignItems="center" id="toolbar-chat-input-container" />
                </Flex>
            </Flex>
        </>
    );
}
