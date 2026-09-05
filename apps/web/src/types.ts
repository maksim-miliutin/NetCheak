/**
 * Everything here is measured by the server, so it is declared there — beside the
 * function that produces it — and only named again here. Two copies of the same
 * shape drifted three times: a cause added to a verdict, a field added to the proxy
 * state, and a host list added after that, each time on one side only.
 *
 * These are type-only imports, so nothing from the server reaches the bundle: both
 * the page build and the binary erase them before anything is resolved.
 */

export type { SamplePoint, StatusRow, SpeedRow, Run, History, RoutedHost }
    from '../../api/src/db/checks.repository.ts';

export type { Level, Cause, Verdict } from '../../api/src/verdict/verdict.ts';

export type { Answer, Reach, Rings } from '../../api/src/route/rings.ts';

export type { Lookup, Agreement, DnsCheck } from '../../api/src/dns/resolve.ts';

export type { Handshake, Certificate, TlsCheck } from '../../api/src/tls/handshake.ts';

export type { Hop, Trace } from '../../api/src/route/traceroute.ts';

export type { Adapter, Tunnels } from '../../api/src/route/tunnels.ts';

export type { Path } from '../../api/src/mtu/mtu.ts';

export type { Sixth, SixthCheck } from '../../api/src/route/sixth.ts';

export type { Neighbour, Household } from '../../api/src/route/neighbours.ts';

export type { Culprit, Cut } from '../../api/src/tls/cut.ts';

export type { Errand, Outbound } from '../../api/src/report/outbound.ts';

export type { Newer } from '../../api/src/update/version.ts';

export type { Way } from '../../api/src/proxy/ways.ts';

export type { Answered, Tried, Evasion } from '../../api/src/tls/evasion.ts';

export type { Relay } from '../../api/src/proxy/pac.ts';

export type { Told } from '../../api/src/proxy/proxy.ts';

export type { Preset } from '../../api/src/proxy/presets.ts';

export type { ProxyState } from '../../api/src/http/proxy.routes.ts';

export type { Status, Health } from '../../api/src/http/wire.ts';

export type { Settings, DivertState } from '../../api/src/divert/runner.ts';

export type { Attempt, Found } from '../../api/src/divert/search.ts';

export type { DriverFound } from '../../api/src/db/checks.repository.ts';

export type { Searched } from '../../api/src/http/divert.routes.ts';
