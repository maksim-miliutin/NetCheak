# netcheck

Answers the question you actually have when a page will not open: *what broke?*
It probes the connection in layers and names the one where it stops working.

## Running it

```
npm install
npm run dev --workspace @netcheck/api     # http://localhost:3001
npm run dev --workspace @netcheck/web     # http://localhost:5173
```

The API writes to `netcheck.db` in the working directory. Set `NETCHECK_DB` to put
it somewhere else. Nothing else to install: no database server, no container.

```
npm test          # 56 tests
npm run typecheck
```

## Layout

```
apps/api/src/
    probe/       one TCP connection per attempt, timed
    verdict/     turns the results into a named cause
    db/          SQLite storage and the checks repository
    http/        Fastify routes
apps/web/src/    the dashboard
```

## Why TCP and not ICMP

A ping needs raw sockets, which means administrator rights, and it is dropped along
plenty of paths that pass ordinary traffic. A TCP connection to port 443 needs no
privileges and travels the same road real traffic does. The trade-off is that it
measures the handshake rather than the wire, so the numbers sit a little above what
`ping` reports.

## What the verdict can and cannot say

| Seen | Said |
|---|---|
| Nothing answers, addresses included | The problem is local: cable, router or provider |
| Addresses answer, no name does | Name resolution is failing |
| Some hosts dead, others fine | Their outage, not yours |
| Everything answers, with loss or jitter | The link is unsteady |

It stops there on purpose. Telling a dead cable from a dead provider needs the
traceroute stage; telling a broken resolver from a blocked one needs the DNS stage.
A guess dressed as a diagnosis is worse than no diagnosis.

## Notes

- `node:sqlite` is used directly, so there is no native module to compile. It needs
  Node 22.5 or newer, and vitest 3 or newer to know the module exists.
- Foreign keys are on and each migration runs in a transaction: a file that fails
  halfway is not recorded as applied.
- A run and its samples are written together. Half a write would draw an empty chart,
  which reads as a quiet network rather than as lost data.

## Building the executable

```
npm install
npm run build:binary
```

That leaves `build/netcheck.cjs`, a single script carrying the API, the migrations and
the dashboard. Turning it into a binary is two more commands:

```
node --experimental-sea-config build/sea-config.json
node -e "require('fs').copyFileSync(process.execPath, 'build/netcheck.exe')"
npx postject build/netcheck.exe NODE_SEA_BLOB build/netcheck.blob ^
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```

The result is around 120 MB, because a copy of Node is inside it. The user downloads
one file, runs it, and opens `http://127.0.0.1:3001`. The database appears next to the
executable and follows it wherever it is moved.

## What leaves the machine

Only the measurements themselves: TCP connections to the targets listed in the app,
and, when the speed run is asked for, transfers to Cloudflare's public endpoints. There
is no telemetry, no account and no upload of results anywhere.

The server listens on the loopback address, so nothing outside the machine can reach
it. It also refuses any request carrying an origin it does not recognise: a page open
in the browser could otherwise skip the CORS preflight with a plain content type and
still make this machine open connections or spend traffic, hiding only the answer.

The database holds host names, timings and verdicts. No addresses of pages visited, no
traffic contents, nothing about the user.
