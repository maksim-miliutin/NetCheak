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
it somewhere else, and `PORT` to ask for a particular one. If the port is taken the
next free one is used and the choice is printed. Nothing else to install: no database
server, no container.

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

## Getting past a block

The tool can tell you whether a block in the way is one that splitting the write gets
past — the trick most circumvention tools use, tried once and measured. It does not do
the splitting for you. Doing it for every connection means a driver in the kernel and
the administrator rights that come with one, and this tool has refused those from the
start: a diagnostic that asks to run inside the kernel is asking for more trust than
it can repay.

Knowing which measure would work is what lets a person choose a tool that does it.

It can also do the splitting, for a browser pointed at it. Starting the proxy opens a
port on this machine; set the browser's HTTP proxy to it and every connection through
it has its first write cut in two, so no single packet carries the name of the site.

Better than pointing the browser at it outright is giving the browser the address of
`/api/proxy.pac` as its automatic proxy configuration. Only the hosts that turned out
to need a different way of writing go through the proxy; everything else goes straight
out and never touches this tool. Less of a person's traffic passing through it is the
point, not more.

On CONNECT the proxy relays bytes without reading them: the traffic stays encrypted
end to end and this holds no key to any of it. It covers what is pointed at it and
nothing else, which is the price of not installing a driver in the kernel. It is off
until switched on, and while it runs it is listed under what leaves this machine.

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
