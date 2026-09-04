import { Why } from './Why';
import type { Words } from '../words';
import type
{
    ProxyState,
} from '../types';

interface ProxyProps
{
    proxy: ProxyState | null;
    say: Words;
    chosen: string;
    onChoose: (preset: string) => void;
    busy: boolean;
    onSwitch: () => void;
    forPhone: boolean;
    onForPhone: (wanted: boolean) => void;
}

/**
 * Ten buttons reading "use this one" made the reader compare ten paragraphs before
 * pressing anything. A list says the same thing and explains only the set in hand.
 * The list is dead while a proxy runs: the server can start or stop, not change its
 * mind, and an enabled control that does nothing is a lie.
 */

/**
 * Ten buttons reading "use this one" made the reader compare ten paragraphs before
 * pressing anything. A list says the same thing and explains only the set in hand.
 * The list is dead while a proxy runs: the server can start or stop, not change its
 * mind, and an enabled control that does nothing is a lie.
 */
export function Proxy({ proxy, say, chosen, onChoose, busy, onSwitch, forPhone,
    onForPhone }: ProxyProps)
{
    const running = proxy?.running === true;
    const presets = proxy?.presets ?? [];

    const says = chosen === ''
        ? say.proxyAllSays
        : say.presetSays[chosen] ?? '';

    const state = running
        ? (proxy.preset === null
            ? say.proxyRunning
            : say.presetRunning(say.presetNames[proxy.preset] ?? proxy.preset))
        : say.proxyOff;

    return (
        <section className={busy ? 'proxy working' : 'proxy'} aria-busy={busy}>
            <span className="sweep" />

            <div className="top">
                {/* Kept English in both languages on purpose, which is exactly what a
                    translator reaches for first: it made this one a car driver. */}
                <h2 translate="no">{say.proxyTitle}</h2>
                <span className="state" role="status">{state}</span>
            </div>

            <div className="pick">
                <label htmlFor="proxy-set">{say.proxySet}</label>

                <select
                    id="proxy-set"
                    value={chosen}
                    disabled={running || busy}
                    aria-describedby="proxy-says"
                    onChange={(event) => onChoose(event.target.value)}
                >
                    <option value="">{say.proxyAllWays}</option>

                    {presets.map((preset) => (
                        <option key={preset.id} value={preset.id} translate="no">
                            {say.presetNames[preset.id] ?? preset.id}
                        </option>
                    ))}
                </select>

                <button
                    type="button"
                    className={running ? undefined : 'primary'}
                    disabled={busy}
                    onClick={onSwitch}
                >
                    {busy
                        ? (running ? say.proxyDisconnecting : say.proxyConnecting)
                        : (running ? say.disconnect : say.connect)}
                </button>
            </div>

            <p className="says small" id="proxy-says">{says}</p>

            {/* Everybody on that network can route through it once it listens there,
                so it is asked for rather than assumed. */}
            {!running && (
                <label className="repeat small">
                    <input
                        type="checkbox"
                        checked={forPhone}
                        onChange={(event) => onForPhone(event.target.checked)}
                    />
                    {say.forPhone}
                </label>
            )}

            {running && (
                <div className="small relays">
                    {/* Said in steps rather than in a sentence: whoever is doing this
                        is holding a phone in the other hand. */}
                    {proxy.onNetwork && proxy.lan !== null && (
                        <div className="phone">
                            <p className="carry big">
                                {say.phoneHow(proxy.lan, proxy.relays[0]?.port ?? 3128)}
                            </p>

                            {proxy.key !== null && (
                                <p className="carry big">
                                    {say.phoneKey}: {proxy.key}
                                </p>
                            )}

                            <p className="small">{say.phoneKeyWhy}</p>
                            <p className="blamed">{say.phoneWarn}</p>

                            {/* Read once and followed once; after that they are in
                                the way of the thing they explained. */}
                            <Why say={say}>
                                <ol>
                                    {say.phoneSteps.map((step) =>
                                        <li key={step}>{step}</li>)}
                                </ol>

                                <p>{say.phoneCheck}</p>
                            </Why>
                        </div>
                    )}

                    <Why say={say}>
                        <p>{proxy.system ? say.systemSet : say.systemFailed}</p>
                        <p>{say.proxyBlind}</p>
                        {proxy.overHttps && <p>{say.proxyOverHttps}</p>}
                    </Why>

                    <ul className="ports">
                        {proxy.relays.map((relay) => (
                            <li key={relay.port}>
                                <code className="carry">127.0.0.1:{relay.port}</code>
                                <span>{say.wayNames[relay.way] ?? relay.way}</span>
                            </li>
                        ))}
                    </ul>

                </div>
            )}

            {/* Held while it runs and written down nowhere: a list of the sites
                somebody opened is the one thing this tool promises not to keep. */}
            {running && (
                <ul className="lines" aria-live="off">
                    {/* Why it might stay empty, said where the question comes up
                        rather than behind the fold above: somebody watching an empty
                        list is asking this exact thing. */}
                    {(proxy.told ?? []).length === 0 && (
                        <>
                            <li className="quiet">{say.nothingWentYet}</li>
                            <li className="quiet">{say.nothingWhy}</li>
                        </>
                    )}

                    {[...(proxy.told ?? [])].reverse().map((one, at) => (
                        <li key={`${at}-${one.host}-${one.bytes}`}>
                            <code>
                                {one.error === null
                                    ? say.wentThrough(one.host, one.pieces)
                                    : say.didNotGo(one.host)}

                                {/* A filter that lets the hello through and drops the
                                    answer leaves a line that looks like success. */}
                                {one.carried !== undefined && ' · '}
                                {one.carried !== undefined && (one.carried === 0
                                    ? say.nothingCameBack
                                    : say.cameBack(one.carried))}
                            </code>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
