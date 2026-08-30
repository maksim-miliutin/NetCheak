import type { Cause, Verdict } from './types';

export type Tongue = 'en' | 'ru';

export interface Said
{
    headline: string;
    detail: (v: Verdict) => string;
}

export interface Words
{
    chain: Record<string, string>;
    throughTunnel: (names: string) => string;
    measureMtu: string;
    checkSixth: string;
    whoCuts: string;
    tryEvasion: string;
    tools: string;
    startProxy: string;
    wayNames: Record<string, string>;
    answerNames: Record<string, string>;
    useThisWay: (way: string) => string;
    triedAll: string;
    stopProxy: string;
    proxyRunning: string;
    proxyStep: (n: number) => string;
    systemSet: string;
    systemFailed: string;
    systemLimit: string;
    forPhone: string;
    phoneHow: (address: string, port: number) => string;
    phoneWarn: string;
    presets: string;
    presetNames: Record<string, string>;
    presetSays: Record<string, string>;
    usePreset: string;
    presetRunning: (name: string) => string;
    proxyBlind: string;
    proxyOverHttps: string;
    trying: string;
    evasion: Record<string, string>;
    checkThisSite: string;
    dragMe: string;
    bookmarklet: string;
    checking: string;
    culprit: Record<string, string>;
    whatLeaves: string;
    lookForUpdate: string;
    upToDate: (version: string) => string;
    newerExists: (latest: string) => string;
    couldNotAsk: string;
    onDemand: string;
    neverDoes: string;
    devices: (n: number) => string;
    theRouter: string;
    sixth: Record<string, string>;
    measuring: string;
    mtuFull: (mtu: number) => string;
    mtuShort: (mtu: number, ordinary: number) => string;
    runChecks: string;
    measureSpeed: string;
    copyReport: string;
    copied: string;
    keepChecking: string;
    watchAddress: string;
    watch: string;
    remove: string;
    tracePath: string;
    tracing: string;
    loading: string;
    loss: string;
    average: string;
    jitter: string;
    checksKept: (n: number) => string;
    notCheckedYet: string;
    down: string;
    up: string;
    measuredAgainst: (source: string, streams: number) => string;
    connecting: string;
    askingResolvers: string;
    readingCertificates: string;
    pullingData: string;
    noResolver: string;
    noNamedTargets: string;
    emptyTrace: string;
    said: Record<Cause, Said>;
    next: Record<Cause, string[]>;
    dns: Record<string, string>;
}

/** A person reading a broken connection wants their own language, not a second one. */
export function pickTongue(from: readonly string[]): Tongue
{
    return from.some((tag) => tag.toLowerCase().startsWith('ru')) ? 'ru' : 'en';
}

const list = (names: string[], and: string): string =>
{
    if (names.length <= 1)
    {
        return names[0] ?? '';
    }

    return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
};

const EN: Words =
{
    throughTunnel: (names) => `Traffic may be leaving through ${names}. `
        + 'What travels inside it cannot be seen from here.',

    measureMtu: 'measure packet size',
    checkSixth: 'Check IPv6',
    whoCuts: 'who cuts it',
    tryEvasion: 'would splitting help',
    tools: 'Tools and disclosure',
    startProxy: 'Start the splitting proxy',
    answerNames:
    {
        'greeted': 'got through',
        'complained': 'answered, but refused',
        'reset': 'cut',
        'silent': 'nothing came back',
    },

    useThisWay: (way) => `Start the proxy this way (${way})`,
    triedAll: 'Each way of writing the hello, and what came back:',

    wayNames:
    {
        'whole': 'sent whole',
        'name': 'cut through the name',
        'first-byte': 'one byte first',
        'many': 'cut into four',
        'records': 'split across two records',
    },
    stopProxy: 'Stop the proxy',
    proxyRunning: 'Running, one for each way of writing.',
    proxyStep: (n) => `${n}.`,
    systemSet: 'The system proxy setting is done, so this covers the browser and most '
        + 'other programs on this machine without any of them being set up by hand. '
        + 'Only the sites that needed help go through it; the rest of your traffic '
        + 'goes straight out. Stopping puts the setting back as it was.',
    systemFailed: 'The system setting could not be changed, so only programs told '
        + 'about the proxy by hand will use it.',
    presets: 'Ready-made settings',
    usePreset: 'use this one',
    presetRunning: (name) => `Running: ${name}.`,

    presetNames:
    {
        'lite-1': 'Lite 1',
        'lite-2': 'Lite 2',
        'lite-3': 'Lite 3',
        'shred-1': 'Shred 1',
        'shred-2': 'Shred 2',
        'records-1': 'Records 1',
        'records-2': 'Records 2',
        'records-3': 'Records 3',
        'mix-1': 'Mix 1',
        'mix-2': 'Mix 2',
    },

    presetSays:
    {
        'lite-1': 'The hello cut through the name. The lightest thing that gets past a '
            + 'filter reading it, and where to start.',
        'lite-2': 'The same, with names looked up over HTTPS — for a block that lives '
            + 'in the answer rather than in the packet.',
        'lite-3': 'One byte, then the rest, for a filter that reads only the packet a '
            + 'connection opens with.',
        'shred-1': 'The hello in four pieces, for a filter that reassembles two.',
        'shred-2': 'In ten pieces, none holding anything to act on. A write and a wait '
            + 'for each, which is what it costs.',
        'records-1': 'The handshake in two TLS records rather than one. Not packet '
            + 'splitting at all, and it gets past different filters.',
        'records-2': 'Three records rather than two, for a filter that puts two back '
            + 'together.',
        'records-3': 'Two records held far apart. Slower on every connection, so worth '
            + 'it once the quicker ones have failed.',
        'mix-1': 'Records of their own, each written in pieces. For a filter that '
            + 'reassembles one of those and not the other.',
        'mix-2': 'The same, held as far apart as is worth waiting for. The one to '
            + 'reach for when nothing else got through.',
    },

    forPhone: 'Reachable from a phone',
    phoneHow: (address, port) => `On the phone, in the Wi-Fi settings for this network, `
        + `set the HTTP proxy to ${address} port ${port}.`,
    phoneWarn: 'While this is on, anybody else on this network can route their traffic '
        + 'through here too. Turn it off when the phone no longer needs it.',

    systemLimit: 'Programs that open their own connections without asking the system — '
        + 'some games and clients among them — are not covered. Covering every packet '
        + 'whatever the program means a driver inside the kernel, and this tool does '
        + 'not ask for those rights.',
    proxyBlind: 'It relays bytes without reading them: the traffic stays encrypted end '
        + 'to end and this holds no key to any of it.',
    proxyOverHttps: 'Names going through it are looked up over HTTPS. Splitting the '
        + 'write answers a filter reading the name; this answers a resolver handing '
        + 'back somebody else\'s address, which is a different block entirely.',
    trying: 'trying…',
    checkThisSite: 'Check this site',
    dragMe: 'Make a bookmark with this as its address. On a page that will not open, '
        + 'press it: this tool opens with that site already being checked. Nothing '
        + 'watches your browsing — the bookmark simply carries the address across.',
    bookmarklet: 'check with netcheck',
    checking: 'checking…',
    whatLeaves: 'What leaves this machine',
    lookForUpdate: 'Look for a newer version',
    upToDate: (version) => `This is version ${version}, and it is the newest.`,
    newerExists: (latest) => `Version ${latest} is out. Nothing updates on its own: `
        + 'download it when it suits you.',
    couldNotAsk: 'Could not ask whether a newer version exists.',
    onDemand: 'only when asked',
    neverDoes: 'What it never does',
    devices: (n) => `${n} devices on this network`,
    theRouter: 'the router',
    measuring: 'measuring…',
    mtuFull: (mtu) => `Packets of the usual ${mtu} bytes cross whole.`,
    mtuShort: (mtu, ordinary) => `Only ${mtu} bytes cross whole, where ${ordinary} is `
        + 'usual. Pages open and large files stall, because anything bigger is dropped '
        + 'rather than broken up.',

    chain:
    {
        'This machine': 'This machine',
        'Router': 'Router',
        'Provider': 'Provider',
        'Names': 'Names',
        'Connections': 'Connections',
    },
    runChecks: 'Run the checks',
    measureSpeed: 'Measure speed',
    copyReport: 'Copy report',
    copied: 'Copied',
    keepChecking: 'Keep checking',
    watchAddress: 'Watch another address',
    watch: 'Watch',
    remove: 'remove',
    tracePath: 'trace the path',
    tracing: 'tracing…',
    loading: 'Loading…',
    loss: 'loss',
    average: 'average',
    jitter: 'jitter',
    checksKept: (n) => `${n} checks kept`,
    notCheckedYet: 'not checked yet',
    down: 'down',
    up: 'up',
    measuredAgainst: (source, streams) =>
        `measured against ${source} over ${streams} connections`,
    connecting: 'Connecting to each target',
    askingResolvers: 'Asking two resolvers the same name',
    readingCertificates: 'Reading certificates',
    pullingData: 'Pulling and pushing data, about ten seconds',
    noResolver: 'No system resolver could be read.',
    noNamedTargets: 'No named targets to check.',
    emptyTrace: 'The trace came back empty.',

    said:
    {
        'none':
        {
            headline: 'Your connection is fine',
            detail: (v) => `All ${v.total} targets answered, losing nothing.`,
        },
        'never-checked':
        {
            headline: 'Nothing measured yet',
            detail: () => 'Run a check to see where the connection stands.',
        },
        'link':
        {
            headline: 'Nothing is reachable',
            detail: () => 'Even raw addresses stayed silent, so the problem is at your end. '
                + 'The router could not be reached to narrow it down further.',
        },
        'router':
        {
            headline: 'The router is not answering',
            detail: () => 'Nothing beyond this machine replied, and neither did the gateway. '
                + 'Check the cable and the router itself before blaming the provider.',
        },
        'provider':
        {
            headline: 'The line past the router is down',
            detail: () => 'The router answers, so the cable and the box are fine. Nothing '
                + 'beyond it replies, which puts the fault with the provider.',
        },
        'dns':
        {
            headline: 'Names do not resolve',
            detail: (v) => `Addresses answer, ${list(v.blame, 'and')} do not. Packets travel; `
                + 'it is the lookup that fails. Changing the DNS server usually fixes it.',
        },
        'sinkholed':
        {
            headline: 'Something is standing in for these names',
            detail: (v) => `${list(v.blame, 'and')} resolve to an address nobody can route to, `
                + 'so the answer did not come from the site.',
        },
        'filtered':
        {
            headline: 'The names resolve and still will not open',
            detail: (v) => `${list(v.blame, 'and')} are found by the resolver, so the lookup `
                + 'is fine. The connection itself is what fails.',
        },
        'handshake-cut':
        {
            headline: 'The connection opens and is cut',
            detail: (v) => `${list(v.blame, 'and')} accept a connection and then sever it `
                + 'during the handshake. Nothing is lost on the way, which is why the '
                + 'numbers below look healthy.',
        },
        'remote':
        {
            headline: 'Your connection works',
            detail: (v) => `${list(v.blame, 'and')} did not answer while the rest did, so the `
                + 'outage is on their side, not yours.',
        },
        'unstable':
        {
            headline: 'The connection is unsteady',
            detail: (v) => `${list(v.blame, 'and')} answered, but with losses or wandering `
                + 'latency. Calls and games will stutter; pages will mostly load.',
        },
    },

    next:
    {
        'none': [],
        'never-checked': [],
        'link':
        [
            'Check the cable between the machine and the router',
            'Look at whether other devices on the same network can reach anything',
        ],
        'router':
        [
            'Check the cable and the lights on the router',
            'Restart the router and run the checks again',
        ],
        'provider':
        [
            'Ask the provider whether there is an outage on your line',
            'Copy the report below into the ticket, so the numbers go with it',
        ],
        'dns':
        [
            'Set the DNS server to 1.1.1.1 or 9.9.9.9 in the network settings',
            'Run the checks again to see whether the names resolve then',
        ],
        'sinkholed':
        [
            'The answer is coming from somewhere between you and the site',
            'A different DNS server usually gets around it',
        ],
        'filtered':
        [
            'Changing the DNS server will not help: the lookup already works',
            'Try the same names from another network to see whether it follows you',
        ],
        'handshake-cut':
        [
            'The connection is cut after it opens, so the address is reachable',
            'Try the same names from another network to see whether it follows you',
        ],
        'remote': [],
        'unstable':
        [
            'Run the checks for a while: the history below shows whether it comes and goes',
            'If it does, copy the report into a ticket with the provider',
        ],
    },

    evasion:
    {
        'helps': 'A hello sent whole is stopped, and one of the ways of writing it '
            + 'differently gets through. Which one is below, and the proxy can be '
            + 'started that way.',
        'no-block': 'The hello gets through whole, so there is nothing here to get past.',
        'no-help': 'The hello is stopped whether it is sent whole or in pieces, so '
            + 'splitting the write is not the way around this one.',
    },

    culprit:
    {
        'open': 'The connection opens and completes, so nothing here objects to it.',
        'name-read': 'The connection opens, survives a handshake that does not say '
            + 'which site is wanted, and dies when it does. Something along the way '
            + 'reads the name and objects to it.',
        'address-blocked': 'The handshake dies whether the site is named or not, so '
            + 'the objection is to the address itself.',
        'site-down': 'Nothing is listening at that address, which is the site being '
            + 'down rather than anything cutting it.',
        'unclear': 'The attempts did not differ in a way that says who cut it.',
    },

    sixth:
    {
        'absent': 'This machine has no address of the sixth version, so nothing tries '
            + 'to use it. That is ordinary and costs nothing.',
        'link-local-only': 'An address was found but nothing was tried against it.',
        'working': 'The sixth version carries traffic, so a browser reaching for it '
            + 'first loses no time.',
        'broken': 'This machine holds an address of the sixth version that leads '
            + 'nowhere. A browser tries that family first and waits for it to fail, '
            + 'so every page opens slowly for a reason nothing on screen explains.',
    },

    dns:
    {
        'agree': 'Your resolver answers the same as a public one.',
        'sinkholed': 'Your resolver points this name at an address nobody can route to. '
            + 'That answer did not come from the site: something is standing in for it.',
        'differ': 'Your resolver returns a different address than a public one does. '
            + 'Often that is just a content network handing out a nearer server, so this '
            + 'is worth a look rather than a conclusion.',
        'system-fails': 'Your resolver cannot answer, while a public one can. '
            + 'Changing the DNS server would fix this.',
        'public-fails': 'Your resolver answers and the public one does not, which usually '
            + 'means the public one is blocked rather than broken.',
        'both-fail': 'Neither resolver answered, so the name itself may be gone.',
        'unknown': 'No system resolver could be read.',
    },
};

const RU: Words =
{
    throughTunnel: (names) => `Трафик может уходить через ${names}. `
        + 'Что идёт внутри, отсюда не видно.',

    measureMtu: 'измерить размер пакета',
    checkSixth: 'Проверить IPv6',
    whoCuts: 'кто режет',
    tryEvasion: 'поможет ли дробление',
    tools: 'Средства и раскрытие',
    startProxy: 'Включить дробящий прокси',
    answerNames:
    {
        'greeted': 'прошло',
        'complained': 'ответили отказом',
        'reset': 'оборвали',
        'silent': 'ничего не вернулось',
    },

    useThisWay: (way) => `Включить прокси этим способом (${way})`,
    triedAll: 'Каждый способ записи приветствия и что вернулось:',

    wayNames:
    {
        'whole': 'целиком',
        'name': 'разрез по имени',
        'first-byte': 'сначала один байт',
        'many': 'на четыре части',
        'records': 'двумя записями',
    },
    stopProxy: 'Выключить прокси',
    proxyRunning: 'Запущены, по одному на каждый способ записи.',
    proxyStep: (n) => `${n}.`,
    systemSet: 'Системная настройка прокси проставлена — покрыт браузер и большинство '
        + 'других программ на этой машине, настраивать вручную ничего не нужно. Через '
        + 'прокси идут только сайты, которым он понадобился, остальной трафик уходит '
        + 'напрямую. При выключении настройка вернётся как была.',
    systemFailed: 'Системную настройку изменить не удалось, поэтому прокси будут '
        + 'пользоваться только программы, которым про него сказали вручную.',
    presets: 'Готовые наборы',
    usePreset: 'включить этот',
    presetRunning: (name) => `Работает: ${name}.`,

    presetNames:
    {
        'lite-1': 'Lite 1',
        'lite-2': 'Lite 2',
        'lite-3': 'Lite 3',
        'shred-1': 'Shred 1',
        'shred-2': 'Shred 2',
        'records-1': 'Records 1',
        'records-2': 'Records 2',
        'records-3': 'Records 3',
        'mix-1': 'Mix 1',
        'mix-2': 'Mix 2',
    },

    presetSays:
    {
        'lite-1': 'Приветствие разрезано по имени. Самое лёгкое, что обходит фильтр, '
            + 'который это имя читает, — с него и начинают.',
        'lite-2': 'То же плюс разрешение имён по HTTPS — на случай, когда блокировка '
            + 'живёт в ответе, а не в пакете.',
        'lite-3': 'Один байт, потом остальное, — для фильтра, который читает только '
            + 'тот пакет, которым открывается соединение.',
        'shred-1': 'Приветствие на четыре части, для фильтра, который собирает две.',
        'shred-2': 'На десять частей, ни в одной нет ничего, за что зацепиться. Цена — '
            + 'запись и пауза на каждую.',
        'records-1': 'Рукопожатие в двух записях TLS вместо одной. Это вообще не '
            + 'дробление пакетов, и обходит оно другие фильтры.',
        'records-2': 'Три записи вместо двух — для фильтра, который собирает обратно '
            + 'две.',
        'records-3': 'Две записи, разнесённые далеко. Медленнее на каждом соединении, '
            + 'поэтому берут, когда быстрые не сработали.',
        'mix-1': 'Отдельные записи, и каждая записана по частям. Для фильтра, который '
            + 'собирает одно и не собирает другое.',
        'mix-2': 'То же, с самыми длинными паузами, какие имеет смысл ждать. Берут, '
            + 'когда не прошло ничего другого.',
    },

    forPhone: 'Доступен с телефона',
    phoneHow: (address, port) => `На телефоне в настройках этой сети Wi-Fi укажите `
        + `HTTP-прокси ${address}, порт ${port}.`,
    phoneWarn: 'Пока это включено, любой в этой сети тоже может пустить свой трафик '
        + 'через вас. Выключайте, когда телефону перестанет быть нужно.',

    systemLimit: 'Программы, открывающие соединения сами, не спрашивая систему, — '
        + 'часть игр и клиентов — не покрыты. Чтобы покрыть каждый пакет любой '
        + 'программы, нужен драйвер в ядре, а таких прав инструмент не просит.',
    proxyBlind: 'Байты переносятся без чтения: трафик остаётся зашифрованным от конца '
        + 'до конца, и ключа к нему здесь нет.',
    proxyOverHttps: 'Имена, идущие через него, разрешаются по HTTPS. Дробление записи '
        + 'отвечает фильтру, читающему имя; это отвечает резольверу, отдающему чужой '
        + 'адрес, — а это совсем другая блокировка.',
    trying: 'пробую…',
    checkThisSite: 'Проверить этот сайт',
    dragMe: 'Создайте закладку с этим адресом. На странице, которая не открывается, '
        + 'нажмите её: инструмент откроется с уже начатой проверкой этого сайта. Ни за '
        + 'чем следить не нужно — закладка просто переносит адрес.',
    bookmarklet: 'проверить в netcheck',
    checking: 'проверяю…',
    whatLeaves: 'Что уходит с этой машины',
    lookForUpdate: 'Проверить, есть ли новая версия',
    upToDate: (version) => `Это версия ${version}, и она самая свежая.`,
    newerExists: (latest) => `Вышла версия ${latest}. Само ничего не обновляется — `
        + 'скачайте, когда будет удобно.',
    couldNotAsk: 'Не удалось спросить про новую версию.',
    onDemand: 'только по нажатию',
    neverDoes: 'Чего он не делает никогда',
    devices: (n) => `устройств в этой сети: ${n}`,
    theRouter: 'роутер',
    measuring: 'измеряю…',
    mtuFull: (mtu) => `Пакеты обычных ${mtu} байт проходят целиком.`,
    mtuShort: (mtu, ordinary) => `Целиком проходит только ${mtu} байт вместо обычных `
        + `${ordinary}. Страницы открываются, а крупные файлы виснут: всё, что больше, `
        + 'отбрасывается вместо дробления.',

    chain:
    {
        'This machine': 'этот компьютер',
        'Router': 'роутер',
        'Provider': 'провайдер',
        'Names': 'имена',
        'Connections': 'соединения',
    },
    runChecks: 'Проверить',
    measureSpeed: 'Измерить скорость',
    copyReport: 'Скопировать отчёт',
    copied: 'Скопировано',
    keepChecking: 'Проверять дальше',
    watchAddress: 'Добавить адрес',
    watch: 'Следить',
    remove: 'убрать',
    tracePath: 'показать путь',
    tracing: 'идёт трассировка…',
    loading: 'Загрузка…',
    loss: 'потери',
    average: 'среднее',
    jitter: 'разброс',
    checksKept: (n) => `сохранено проверок: ${n}`,
    notCheckedYet: 'ещё не проверялось',
    down: 'на приём',
    up: 'на отдачу',
    measuredAgainst: (source, streams) =>
        `замер до ${source} в ${streams} потока`,
    connecting: 'Соединяюсь с каждой целью',
    askingResolvers: 'Спрашиваю одно имя у двух резольверов',
    readingCertificates: 'Читаю сертификаты',
    pullingData: 'Качаю и отдаю данные, около десяти секунд',
    noResolver: 'Системный резольвер прочитать не удалось.',
    noNamedTargets: 'Целей с именами нет.',
    emptyTrace: 'Трассировка вернулась пустой.',

    said:
    {
        'none':
        {
            headline: 'Связь в порядке',
            detail: (v) => `Ответили все ${v.total} цели, потерь нет.`,
        },
        'never-checked':
        {
            headline: 'Пока ничего не измерено',
            detail: () => 'Запустите проверку, чтобы увидеть, как обстоят дела.',
        },
        'link':
        {
            headline: 'Не отвечает ничего',
            detail: () => 'Молчат даже адреса, которым не нужно разрешать имя, значит дело '
                + 'на вашей стороне. Дотянуться до роутера не удалось, поэтому сузить '
                + 'дальше нечем.',
        },
        'router':
        {
            headline: 'Роутер не отвечает',
            detail: () => 'Не ответил никто за пределами этой машины, и сам шлюз тоже. '
                + 'Проверьте кабель и коробку, прежде чем винить провайдера.',
        },
        'provider':
        {
            headline: 'Линия за роутером легла',
            detail: () => 'Роутер отвечает, значит кабель и коробка в порядке. Дальше него '
                + 'не отвечает ничего — вопрос к провайдеру.',
        },
        'dns':
        {
            headline: 'Имена не разрешаются',
            detail: (v) => `Адреса отвечают, ${list(v.blame, 'и')} — нет. Пакеты доходят, `
                + 'подводит поиск имени. Обычно помогает смена DNS-сервера.',
        },
        'sinkholed':
        {
            headline: 'Вместо этих имён отвечает кто-то другой',
            detail: (v) => `${list(v.blame, 'и')} разрешаются в адрес, до которого нельзя `
                + 'дойти, значит ответ пришёл не от сайта.',
        },
        'filtered':
        {
            headline: 'Имена разрешаются, а сайты не открываются',
            detail: (v) => `${list(v.blame, 'и')} резольвер находит, значит с поиском всё `
                + 'хорошо. Не работает само соединение.',
        },
        'handshake-cut':
        {
            headline: 'Соединение открывается и обрывается',
            detail: (v) => `${list(v.blame, 'и')} принимают подключение и рвут его на `
                + 'рукопожатии. По дороге ничего не теряется — поэтому цифры ниже '
                + 'выглядят здоровыми.',
        },
        'remote':
        {
            headline: 'Ваша связь работает',
            detail: (v) => `${list(v.blame, 'и')} не ответили, а остальные ответили, значит `
                + 'лежит у них, а не у вас.',
        },
        'unstable':
        {
            headline: 'Связь нестабильна',
            detail: (v) => `${list(v.blame, 'и')} отвечают, но с потерями или гуляющей `
                + 'задержкой. Звонки и игры будут заикаться, страницы в основном откроются.',
        },
    },

    next:
    {
        'none': [],
        'never-checked': [],
        'link':
        [
            'Проверьте кабель между компьютером и роутером',
            'Посмотрите, выходят ли в сеть другие устройства',
        ],
        'router':
        [
            'Проверьте кабель и лампочки на роутере',
            'Перезагрузите роутер и запустите проверку снова',
        ],
        'provider':
        [
            'Спросите провайдера, нет ли аварии на вашей линии',
            'Скопируйте отчёт в обращение, чтобы цифры пошли вместе с ним',
        ],
        'dns':
        [
            'Укажите в настройках сети DNS-сервер 1.1.1.1 или 9.9.9.9',
            'Запустите проверку снова и посмотрите, разрешаются ли имена',
        ],
        'sinkholed':
        [
            'Ответ приходит откуда-то между вами и сайтом',
            'Обычно помогает другой DNS-сервер',
        ],
        'filtered':
        [
            'Смена DNS не поможет: поиск имени уже работает',
            'Проверьте те же имена из другой сети — переедет ли за вами',
        ],
        'handshake-cut':
        [
            'Связь рвётся после открытия, значит адрес достижим',
            'Проверьте те же имена из другой сети — переедет ли за вами',
        ],
        'remote': [],
        'unstable':
        [
            'Оставьте проверку идти: история ниже покажет, приходит ли это волнами',
            'Если да, скопируйте отчёт в обращение к провайдеру',
        ],
    },

    evasion:
    {
        'helps': 'Приветствие целиком не проходит, а один из способов записи — '
            + 'проходит. Какой именно, видно ниже, и прокси можно включить им же.',
        'no-block': 'Приветствие проходит целиком, значит обходить нечего.',
        'no-help': 'Приветствие не проходит ни целиком, ни по частям — дроблением эту '
            + 'блокировку не обойти.',
    },

    culprit:
    {
        'open': 'Соединение открывается и проходит целиком, значит здесь ему никто не мешает.',
        'name-read': 'Соединение открывается, переживает рукопожатие без указания сайта '
            + 'и обрывается, когда сайт назван. Кто-то по пути читает имя и возражает.',
        'address-blocked': 'Рукопожатие обрывается и с именем, и без него, значит '
            + 'возражают против самого адреса.',
        'site-down': 'По этому адресу никто не слушает — сайт лежит, а не режется.',
        'unclear': 'Попытки не разошлись так, чтобы можно было назвать виновника.',
    },

    sixth:
    {
        'absent': 'У этой машины нет адреса шестой версии, значит её никто и не '
            + 'пробует. Это обычное дело и ничего не стоит.',
        'link-local-only': 'Адрес найден, но проверить его не пробовали.',
        'working': 'Шестая версия возит трафик, так что браузер, который тянется к ней '
            + 'первой, ничего не теряет.',
        'broken': 'У этой машины есть адрес шестой версии, ведущий в никуда. Браузер '
            + 'пробует эту семью первой и ждёт отказа, поэтому каждая страница '
            + 'открывается с задержкой, а на экране этому нет объяснения.',
    },

    dns:
    {
        'agree': 'Ваш резольвер отвечает так же, как публичный.',
        'sinkholed': 'Ваш резольвер отдаёт для этого имени адрес, до которого нельзя дойти. '
            + 'Такой ответ пришёл не от сайта — кто-то встал на его место.',
        'differ': 'Ваш резольвер отдаёт не тот адрес, что публичный. Чаще всего это просто '
            + 'ближайший сервер сети доставки, так что это повод посмотреть, а не вывод.',
        'system-fails': 'Ваш резольвер не отвечает, а публичный отвечает. Смена DNS-сервера '
            + 'это починит.',
        'public-fails': 'Ваш резольвер отвечает, а публичный нет — обычно это значит, что '
            + 'публичный заблокирован, а не сломан.',
        'both-fail': 'Не ответил ни один резольвер, возможно самого имени больше нет.',
        'unknown': 'Системный резольвер прочитать не удалось.',
    },
};

export const WORDS: Record<Tongue, Words> = { en: EN, ru: RU };
