import { FC } from 'react';
import { Base, LayoutProgressBar, Text } from '../../common';
import gcLogo from '../../assets/images/loading/gc-logo.svg';

interface LoadingViewProps
{
    isError: boolean;
    message: string;
    percent: number;
}

export const LoadingView: FC<LoadingViewProps> = props =>
{
    const { isError = false, message = '', percent = 0 } = props;

    return (
        <div className="nitro-loading">
            <div className="gc-loading-stack">
                <img src={ gcLogo } alt="logo" className="gc-logo" />
                <div className="gc-loading-status">
                    { isError && message
                        ? <Base className="fs-4 text-shadow">{ message }</Base>
                        : (
                            <>
                                <Text fontSize={ 5 } variant="white" className="gc-loading-percent">{ percent.toFixed() }%</Text>
                                <LayoutProgressBar progress={ percent } className="gc-progress" />
                            </>
                        ) }
                </div>
            </div>
        </div>
    );
}
