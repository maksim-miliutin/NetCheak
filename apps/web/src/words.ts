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
