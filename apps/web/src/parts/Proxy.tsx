import { Log, Why } from './Why';
import type { Chose } from '../api';
import { marks, type Working } from '../read/working';
import type { Words } from '../words';
import type
{
    ProxyState,
} from '../types';

interface ProxyProps
{
    /** Which ways have got a site through, so the choice is not blind. */
    working: Working;

    typedFind: string;
    onTypeFind: (host: string) => void;
    onFind: () => void;
    finding: boolean;
    chose: Chose | null;

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
    onForPhone, working, typedFind, onTypeFind, onFind, finding, chose }: ProxyProps)
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
                    translator reaches for first: it made this one a car driver. The
                    preset names below are not like that — they say what they do, and
                    they say it in the reader's language. */}
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

                    {/* What has already worked, said in the list where the choosing
                        happens. The check knows it and used to keep it beside the
                        site it came from, which is not where anybody decides. */}
                    {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                            {say.presetNames[preset.id] ?? preset.id}
                            {marks(working, preset.way) > 0
                                ? ` — ${say.gotThrough(marks(working, preset.way))}`
                                : ''}
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
            {/* Turned into lines here rather than inside the log: what a line says
                is this block's business, and folding it away is the log's. */}
            {/* Ten sets and a person guessing which. The check that answers this ran
                on a target row and its answer landed here; now the press is here too. */}
            {!running && (
                <div className="pick">
                    <label htmlFor="find-set">{say.findSetFor}</label>

                    <input
                        id="find-set"
                        value={typedFind}
                        disabled={finding}
                        onChange={(event) => onTypeFind(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && onFind()}
                    />

                    <button
                        type="button"
                        disabled={finding || typedFind.trim() === ''}
                        onClick={onFind}
                    >
                        {finding ? say.findingSet : say.findSet}
                    </button>
                </div>
            )}

            {chose !== null && (
                <p className="says">
                    {chose.preset !== null
                        && say.setChosen(say.presetNames[chose.preset] ?? chose.preset)}
                    {chose.preset === null && chose.tried.whole === 'greeted'
                        && say.setNotNeeded}
                    {chose.preset === null && chose.tried.whole !== 'greeted'
                        && say.setNotFound}
                </p>
            )}

            {running && (proxy.told ?? []).length > 0 && (
                <Log
                    lines={[...(proxy.told ?? [])].reverse().map((one) =>
                    {
                        const went = one.error === null
                            ? say.wentThrough(one.host, one.pieces)
                            : say.didNotGo(one.host);

                        if (one.carried === undefined)
                        {
                            return went;
                        }

                        return `${went} · ${one.carried === 0
                            ? say.nothingCameBack
                            : say.cameBack(one.carried)}`;
                    })}
                    say={say}
                    name="proxy"
                />
            )}

            {running && (proxy.told ?? []).length === 0 && (
                <>
                    <p className="says small">{say.nothingWentYet}</p>
                    <p className="says small">{say.nothingWhy}</p>
                </>
            )}
        </section>
    );
}
