import { FC, FormEvent, useEffect, useRef, useState } from 'react';
import gcLogo from '../../assets/images/loading/gc-logo.svg';
import { readDisplayName, useDisplayName } from './useDisplayName';

const MIN = 2;
const MAX = 24;

function paramFromUrl(key: string): string
{
    if (typeof location === 'undefined') return '';
    return new URLSearchParams(location.search).get(key) ?? '';
}

function clampName(raw: string): string
{
    return raw.trim().slice(0, MAX);
}

function signalingHttpBase(): string
{
    if (typeof location === 'undefined') return 'http://localhost:8765';
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:8765';
    return `${location.protocol}//${location.host}/signaling`;
}

function stripNameFromUrl(): void
{
    if (typeof location === 'undefined') return;
    const url = new URL(location.href);
    if (!url.searchParams.has('name')) return;
    url.searchParams.delete('name');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
}

async function postSetName(sso: string, name: string): Promise<{ ok: boolean; status: number; error?: string }>
{
    try
    {
        const r = await fetch(`${ signalingHttpBase() }/set-name`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sso, name })
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.ok) return { ok: true, status: r.status };
        return { ok: false, status: r.status, error: data.error };
    }
    catch (err: any)
    {
        return { ok: false, status: 0, error: err?.message ?? 'network error' };
    }
}

function explainError(status: number, fallback?: string): string
{
    if (status === 409) return 'Esse nome já está em uso.';
    if (status === 404) return 'Usuário não encontrado para esse SSO.';
    if (status === 400) return 'Nome inválido.';
    if (status === 0)   return `Não conseguimos contatar o servidor.${ fallback ? ' (' + fallback + ')' : '' }`;
    return fallback ?? 'Erro inesperado.';
}

interface AutoState { active: boolean; sso: string; name: string; silent: boolean; }

function computeAutoState(): AutoState
{
    const sso = paramFromUrl('sso');
    const urlName = clampName(paramFromUrl('name'));
    const cached = clampName(readDisplayName());

    // URL param wins. If it differs from cache (or cache is empty) we run.
    if (sso && urlName && urlName.length >= MIN && cached !== urlName)
    {
        return { active: true, sso, name: urlName, silent: false };
    }

    // No URL param but the cache has a name: push it once silently in the
    // background so the DB and the cache cannot drift out of sync (covers
    // the case where an older popup version saved only to localStorage).
    if (sso && cached && cached.length >= MIN)
    {
        return { active: true, sso, name: cached, silent: true };
    }

    return { active: false, sso: '', name: '', silent: false };
}

export const NameGate: FC<{}> = () =>
{
    const [ name, setName ] = useDisplayName();
    const [ draft, setDraft ] = useState('');
    const [ error, setError ] = useState<string | null>(null);
    const [ submitting, setSubmitting ] = useState(false);
    const [ auto ] = useState<AutoState>(() => computeAutoState());
    const [ autoBusy, setAutoBusy ] = useState<boolean>(() => auto.active && !auto.silent);
    const ranAutoRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() =>
    {
        if (ranAutoRef.current || !auto.active) return;
        ranAutoRef.current = true;

        let cancelled = false;
        (async () =>
        {
            const r = await postSetName(auto.sso, auto.name);
            if (cancelled) return;

            if (auto.silent)
            {
                if (!r.ok) console.warn('[name-gate] silent re-sync failed', r);
                else console.log('[name-gate] re-synced cached name with DB');
                stripNameFromUrl();
                return;
            }

            if (!r.ok)
            {
                console.warn('[name-gate] auto set-name failed', r);
                setError(explainError(r.status, r.error));
                setDraft(auto.name);
                stripNameFromUrl();
                setAutoBusy(false);
                return;
            }
            setName(auto.name);
            stripNameFromUrl();
            location.reload();
        })();

        return () => { cancelled = true; };
    }, [ auto, setName ]);

    useEffect(() =>
    {
        if (!autoBusy && !name) inputRef.current?.focus();
    }, [ name, autoBusy ]);

    if (name) return null;

    if (autoBusy)
    {
        return (
            <div className="gc-name-gate">
                <div className="gc-name-gate-card">
                    <img src={ gcLogo } alt="logo" className="gc-name-gate-logo" />
                    <h2 className="gc-name-gate-title">Configurando seu acesso...</h2>
                    <p className="gc-name-gate-sub">Aguarde um instante.</p>
                </div>
            </div>
        );
    }

    const onSubmit = async (e: FormEvent) =>
    {
        e.preventDefault();
        const trimmed = clampName(draft);
        if (trimmed.length < MIN) { setError(`O nome precisa ter pelo menos ${ MIN } caracteres.`); return; }

        const sso = paramFromUrl('sso');
        if (!sso) { setError('Faltou o ?sso= na URL.'); return; }

        setSubmitting(true);
        setError(null);
        const r = await postSetName(sso, trimmed);
        if (!r.ok)
        {
            setError(explainError(r.status, r.error));
            setSubmitting(false);
            return;
        }
        setName(trimmed);
        location.reload();
    };

    return (
        <div className="gc-name-gate">
            <form className="gc-name-gate-card" onSubmit={ onSubmit }>
                <img src={ gcLogo } alt="logo" className="gc-name-gate-logo" />
                <h2 className="gc-name-gate-title">Como você quer ser chamado?</h2>
                <p className="gc-name-gate-sub">Esse nome aparece para os outros alunos durante a aula.</p>
                <input
                    ref={ inputRef }
                    className="gc-name-gate-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={ false }
                    placeholder="Seu nome"
                    value={ draft }
                    maxLength={ MAX }
                    onChange={ e => { setDraft(e.target.value); setError(null); } }
                />
                { error && <div className="gc-name-gate-error">{ error }</div> }
                <button type="submit" className="gc-name-gate-btn" disabled={ submitting || clampName(draft).length < MIN }>
                    { submitting ? 'Salvando...' : 'Entrar' }
                </button>
            </form>
        </div>
    );
};
