# netcheck

Your page will not open. Is it you, your router, your provider, the site, or somebody
in between deciding you should not see it?

This answers that, in a sentence, and shows the measurements the sentence rests on.

```
npm install
npm run dev:api     # http://localhost:3001
npm run dev:web     # http://localhost:5173
```

No database server, no container, no account. It writes one file beside itself and
that is the whole of its footprint.

## How it decides

Every check is one layer of the same chain. The verdict is a statement about where
the chain stops.

```mermaid
flowchart TD
    A[This machine] --> B{Gateway answers?}
    B -->|silent| R[The router is not answering]
    B -->|refused or answered| C{Anything past it answers?}
    C -->|nothing| P[The line past the router is down]
    C -->|addresses do| D{Names resolve?}
    D -->|no| E{What do two resolvers say?}
    E -->|ours cannot answer| F[Change the DNS server]
    E -->|ours points nowhere| G[Something stands in for the name]
    D -->|yes| H{Connections open?}
    H -->|cut during handshake| I[Something reads the name and objects]
    H -->|open and complete| J{Losses or wandering latency?}
    J -->|yes| K[The connection is unsteady]
    J -->|no| L[Your connection is fine]
```

Two of those branches are worth spelling out, because no ordinary speed test makes
the distinction and the difference decides what a person should do next.

**A refusal is an answer.** A gateway that refuses a connection has received the
packet and replied to it, which proves the box is alive. Only silence leaves the
question open. That is what separates a dead router from a dead provider.

**A name that resolves is not a name you can reach.** If the lookup works and the
connection still fails, changing the DNS server will not help — and that is precisely
the advice a person would otherwise be given and waste an evening on.

## What it measures

| | |
|---|---|
| Reachability | one TCP connection per attempt, timed; loss and jitter from the spread |
| The nearest hop | the gateway, to tell your equipment from your provider's |
| Names | the same name asked of your resolver and a public one, side by side |
| Certificates | who signed them: a matching name with an unexpected issuer is interception |
| The path | where along the way the packets stop, hop by hop |
| Packet size | the largest that crosses whole, which is why pages open and large files stall |
| IPv6 | whether an address the machine holds actually leads anywhere |
| Speed | four streams, warmed up, measured against a content network |
| Devices | who else is on this network, out of the table the system already keeps |

Every check keeps its history, so a line that drops for a minute every evening — the
case that is invisible in a single reading, and the one people argue with providers
about — shows up as a trace rather than a number.

## Getting past a block

It can tell you whether a block is one that a different way of writing the handshake
gets past, and then be that way.

```mermaid
flowchart LR
    A[Hello sent whole] -->|cut| B[Try five ways]
    B --> C[cut through the name]
    B --> D[one byte first]
    B --> E[into four pieces]
    B --> F[two TLS records]
    C --> G{Any got through?}
    D --> G
    E --> G
    F --> G
    G -->|yes| H[Start that proxy]
    G -->|no| I[Say so, rather than guess]
```

The last of those is not packet splitting at all: the handshake is carried in two TLS
records of its own, which the protocol allows and a server reassembles, while a filter
expecting one record per handshake sees only the first.

Starting the proxies also points the system proxy setting at a file that routes only
the hosts that needed help — everything else goes straight out and never touches this.
The setting belongs to your user rather than the machine, so nothing asks for
administrator rights, and stopping puts it back as it was.

Names going through the proxy are looked up over HTTPS. Splitting the write answers a
filter reading the name out of a packet; resolving over HTTPS answers a resolver
handing back somebody else's address. Separate blocks, separate answers.

### Every packet, whatever the program

That means standing between the network card and the whole machine, which on Windows
means WinDivert: a signed driver, loaded as a service, needing administrator rights.

The arithmetic for it is in `apps/api/src/divert` and is tested byte by byte — a
packet cut in two has to become two whole packets, each with its own lengths, its own
sequence number and its own checksums, or every hop discards both and the connection
dies rather than gets through.

```
npm run check:divert    # are the files there, are the rights there
npm run divert          # watch it cut handshakes on a live connection
```

The driver is not shipped here. It belongs to its author, and installing something
that runs inside the kernel is a decision to make with open eyes rather than to find
already made.

## What leaves this machine

A promise about privacy written in prose goes stale the first time somebody adds a
call, so the list is built from the same values the code uses and shown in the app
under **What leaves this machine**.

- The targets you chose to watch.
- One public resolver, to compare answers against your own.
- A content network, and only while a speed measurement is running.
- The release page, and only if you ask whether a newer version exists.

No telemetry, no analytics, no account. Nothing is uploaded: the history is a file on
your disk. Your location is never asked for. Nothing is read about the pages you
visit or what your traffic contains — the proxy relays bytes without looking at them
and holds no key to any of it.

The report you can hand to a provider carries host names, timings and verdicts, and
says so at the bottom. Devices on your network are counted in it, never named.

## Layout

```
apps/api/src/
    probe/      one TCP connection per attempt, timed
    verdict/    turns results into a named cause
    route/      gateway, traceroute, neighbours, IPv6
    dns/        two resolvers compared; lookups over HTTPS
    tls/        handshakes, certificates, who cut the connection
    mtu/        the largest packet the path carries whole
    proxy/      the ways of writing a hello, and the proxies that do
    divert/     packet arithmetic for the driver path
    speed/      the measurement and its maths
    report/     plain text for somebody who will never open this
    db/         SQLite, migrations, the repository
    http/       routes, and what the last checks found
apps/web/src/
    App.tsx     the page
    words.ts    every string, in both languages
    trace.ts    history into a line
tools/          binary build, driver checks
```

## Rules the code keeps

Things that are true have tests. Things that are unproven say so in the file: the
bridge to the driver can only run where the driver is, and that is not where it was
written.

Where a check cannot tell, it says it cannot tell rather than picking the likelier
answer. A tool that guesses confidently is worse than one that admits a gap, because
the guess is what a person acts on.

```
npm test          # 539 tests
npm run typecheck
```

Both languages are compared against each other in tests: a cause added to the verdict
without a line to show for it would print an empty headline, in whichever language the
reader happens to have.
