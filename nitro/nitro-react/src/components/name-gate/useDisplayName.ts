import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'gc.displayName.';

function ssoFromUrl(): string
{
    if (typeof location === 'undefined') return '';
    const params = new URLSearchParams(location.search);
    return params.get('sso') || '';
}

function storageKey(): string
{
    return STORAGE_PREFIX + (ssoFromUrl() || 'default');
}

export function readDisplayName(): string
{
    try { return localStorage.getItem(storageKey()) ?? ''; } catch { return ''; }
}

export function writeDisplayName(name: string): void
{
    try { localStorage.setItem(storageKey(), name); } catch {}
}

export function useDisplayName(): [ string, (name: string) => void ]
{
    const [ name, setName ] = useState<string>(() => readDisplayName());

    useEffect(() =>
    {
        const onStorage = (e: StorageEvent) =>
        {
            if (e.key === storageKey()) setName(e.newValue ?? '');
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const update = (next: string) =>
    {
        writeDisplayName(next);
        setName(next);
    };

    return [ name, update ];
}
