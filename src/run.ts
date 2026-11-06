import { parseArgs } from 'node:util';
import { OddsAPIClient, OddsAPIError, InvalidAPIKeyError } from 'odds-api-io';
import { table, formatDate, percent, nameOf, type Row } from './format';

const PRICING_URL = 'https://odds-api.io/pricing';
const MAX_ODDS_BOOKMAKERS = 30;

export interface IO {
  out(text: string): void;
  err(text: string): void;
  env: Record<string, string | undefined>;
}

const defaultIO: IO = {
  out: (text) => process.stdout.write(text + '\n'),
  err: (text) => process.stderr.write(text + '\n'),
  env: process.env,
};

export const HELP = `odds-api: the Odds-API.io sports betting odds API in your terminal

Usage
  odds-api <command> [options]

Commands
  sports                          List sports
  bookmakers                      List bookmakers
  events --sport <slug>           List events
      [--league <slug>] [--status pending,live,settled] [--from <iso>] [--to <iso>] [--limit <n>]
  odds <eventId>                  Odds for one event
      [--bookmakers Bet365,Unibet] [--market ML,Totals]
  value-bets --bookmaker <name>   Value bets for a bookmaker, EV column = edge in percent
      [--sport <slug>] [--league <slug>] [--min-ev <percent>] [--limit <n>]
  arbitrage --bookmakers <a,b>    Arbitrage opportunities across bookmakers
      [--limit <n>]

Options
  --key <key>    API key (defaults to the ODDS_API_KEY environment variable)
  --json         Print the raw JSON response
  -h, --help     Show this help
  -v, --version  Show the version

Get an API key at ${PRICING_URL}`;

class UsageError extends Error {}

type Flags = {
  key?: string;
  json?: boolean;
  help?: boolean;
  version?: boolean;
  sport?: string;
  league?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: string;
  bookmakers?: string;
  bookmaker?: string;
  market?: string;
  'min-ev'?: string;
};

export async function run(argv: string[], io: IO = defaultIO): Promise<number> {
  let flags: Flags;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        key: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        sport: { type: 'string' },
        league: { type: 'string' },
        status: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        limit: { type: 'string' },
        bookmakers: { type: 'string' },
        bookmaker: { type: 'string' },
        market: { type: 'string' },
        'min-ev': { type: 'string' },
      },
    });
    flags = parsed.values as Flags;
    positionals = parsed.positionals;
  } catch (error) {
    io.err(`${(error as Error).message}\n\n${HELP}`);
    return 2;
  }

  if (flags.version) {
    io.out(version());
    return 0;
  }
  const [command, ...rest] = positionals;
  if (flags.help || !command) {
    io.out(HELP);
    return 0;
  }

  try {
    const handler = COMMANDS[command];
    if (!handler) throw new UsageError(`Unknown command: ${command}`);
    await handler({ flags, args: rest, io });
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`${error.message}\n\nRun "odds-api --help" for usage.`);
      return 2;
    }
    if (error instanceof InvalidAPIKeyError) {
      io.err(`The API key was rejected. Check ODDS_API_KEY or --key, or get a key at ${PRICING_URL}`);
      return 1;
    }
    if (error instanceof OddsAPIError || error instanceof MissingKeyError) {
      io.err(error.message);
      return 1;
    }
    io.err(`Error: ${(error as Error).message ?? String(error)}`);
    return 1;
  }
}

function version(): string {
  return (require('../package.json') as { version: string }).version;
}

class MissingKeyError extends Error {
  constructor() {
    super(`Missing API key. Set the ODDS_API_KEY environment variable or pass --key <key>.\nGet an API key at ${PRICING_URL}`);
  }
}

interface Context {
  flags: Flags;
  args: string[];
  io: IO;
}

function client(ctx: Context, needsKey: boolean): OddsAPIClient {
  const apiKey = ctx.flags.key ?? ctx.io.env.ODDS_API_KEY ?? '';
  if (needsKey && !apiKey) throw new MissingKeyError();
  return new OddsAPIClient({ apiKey, baseUrl: ctx.io.env.ODDS_API_BASE_URL || undefined });
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new UsageError(`Missing required option --${flag}`);
  return value;
}

function limitOf(flags: Flags): number | undefined {
  if (flags.limit === undefined) return undefined;
  const n = Number(flags.limit);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError('--limit must be a positive whole number');
  return n;
}

function minEdgeOf(flags: Flags): number | undefined {
  if (flags['min-ev'] === undefined) return undefined;
  const n = Number(flags['min-ev']);
  if (flags['min-ev'].trim() === '' || !Number.isFinite(n)) throw new UsageError('--min-ev must be a number, the minimum edge in percent (3 means 3%)');
  return n;
}

// expectedValue is bookmaker odds / fair odds x 100, so 103.4 is a 3.4% edge.
function edgePercent(bet: any): number {
  return Number(bet.expectedValue) - 100;
}

function print(ctx: Context, data: unknown, render: () => string) {
  ctx.io.out(ctx.flags.json ? JSON.stringify(data, null, 2) : render());
}

function eventLabel(event: any): string {
  if (!event) return '';
  return `${event.home ?? nameOf(event.homeParticipant)} vs ${event.away ?? nameOf(event.awayParticipant)}`;
}

function scoreOf(event: any): string {
  const s = event?.scores ?? event?.score;
  if (!s || s.home === undefined || s.away === undefined) return '';
  return `${s.home}-${s.away}`;
}

function marketLabel(market: any): string {
  if (!market) return '';
  const name = nameOf(market) || String(market);
  const line = market.hdp ?? market.marketLine;
  const label = market.label ? ` ${market.label}` : '';
  return line === undefined || line === null ? `${name}${label}` : `${name}${label} ${line}`;
}

const PRICE_KEYS = ['home', 'draw', 'away', 'over', 'under', 'yes', 'no'];

function prices(entry: Record<string, unknown>): string {
  const keys = [
    ...PRICE_KEYS.filter((k) => k in entry),
    ...Object.keys(entry).filter((k) => !PRICE_KEYS.includes(k) && !['hdp', 'label'].includes(k) && !/link|url/i.test(k)),
  ];
  return keys
    .filter((k) => typeof entry[k] === 'string' || typeof entry[k] === 'number')
    .map((k) => `${k} ${entry[k]}`)
    .join(', ');
}

type Handler = (ctx: Context) => Promise<void>;

const COMMANDS: Record<string, Handler> = {
  async sports(ctx) {
    const sports = (await client(ctx, false).getSports()) as any[];
    print(ctx, sports, () => table(['Sport', 'Slug'], sports.map((s) => [s.name, s.slug ?? s.id])));
  },

  async bookmakers(ctx) {
    const bookmakers = (await client(ctx, false).getBookmakers()) as any[];
    print(ctx, bookmakers, () =>
      table(
        ['Bookmaker', 'Active'],
        bookmakers.map((b) => [b.name, b.active === undefined ? '' : b.active ? 'yes' : 'no']),
      ),
    );
  },

  async events(ctx) {
    const { flags } = ctx;
    const params = {
      sport: required(flags.sport, 'sport'),
      league: flags.league,
      status: flags.status,
      from: flags.from,
      to: flags.to,
      limit: limitOf(flags),
    };
    const events = (await client(ctx, true).getEvents(params as any)) as any[];
    print(ctx, events, () =>
      table(
        ['ID', 'Date', 'League', 'Event', 'Status', 'Score'],
        events.map((e) => [e.id, formatDate(e.date ?? e.startTime), nameOf(e.league), eventLabel(e), e.status, scoreOf(e)]),
      ),
    );
  },

  async odds(ctx) {
    const eventId = ctx.args[0];
    if (!eventId) throw new UsageError('Missing event ID: odds-api odds <eventId>');
    const api = client(ctx, true);
    const bookmakers = ctx.flags.bookmakers ?? (await selectedBookmakers(api));
    const odds = (await api.getEventOdds({ eventId, bookmakers })) as any;
    const wanted = ctx.flags.market?.split(',').map((m) => m.trim().toLowerCase()).filter(Boolean);
    print(ctx, odds, () => {
      const rows: Row[] = [];
      for (const [bookmaker, markets] of Object.entries<any[]>(odds.bookmakers ?? {})) {
        for (const market of markets ?? []) {
          if (wanted && !wanted.includes(String(market.name).toLowerCase())) continue;
          for (const entry of market.odds ?? []) {
            rows.push([bookmaker, market.name, entry.label ? `${entry.label} ${entry.hdp ?? ''}`.trim() : entry.hdp, prices(entry)]);
          }
        }
      }
      const header = [eventLabel(odds), nameOf(odds.league), formatDate(odds.date)].filter(Boolean).join('  |  ');
      const body = rows.length ? table(['Bookmaker', 'Market', 'Line', 'Odds'], rows) : 'No odds found for these bookmakers.';
      return header ? `${header}\n\n${body}` : body;
    });
  },

  async 'value-bets'(ctx) {
    const { flags } = ctx;
    const params = {
      bookmaker: required(flags.bookmaker, 'bookmaker'),
      sport: flags.sport,
      league: flags.league,
      includeEventDetails: true,
    };
    const minEdge = minEdgeOf(flags);
    let bets = (await client(ctx, true).getValueBets(params as any)) as any[];
    bets = [...bets].sort((a, b) => Number(b.expectedValue ?? 0) - Number(a.expectedValue ?? 0));
    if (minEdge !== undefined) bets = bets.filter((b) => edgePercent(b) >= minEdge);
    const limit = limitOf(flags);
    if (limit) bets = bets.slice(0, limit);
    print(ctx, bets, () =>
      table(
        ['Date', 'Event', 'Market', 'Side', 'Odds', 'EV'],
        bets.map((b) => [
          formatDate(b.event?.date),
          eventLabel(b.event) || b.eventId,
          marketLabel(b.market),
          b.betSide,
          b.bookmakerOdds?.[b.betSide] ?? b.odds,
          percent(edgePercent(b)),
        ]),
      ),
    );
  },

  async arbitrage(ctx) {
    const { flags } = ctx;
    const params = {
      bookmakers: required(flags.bookmakers, 'bookmakers'),
      limit: limitOf(flags),
      includeEventDetails: true,
    };
    const arbs = (await client(ctx, true).getArbitrageBets(params)) as any[];
    print(ctx, arbs, () =>
      table(
        ['Date', 'Event', 'Market', 'Profit', 'Legs'],
        arbs.map((a) => [
          formatDate(a.event?.date),
          eventLabel(a.event) || a.eventId,
          marketLabel(a.market),
          percent(a.profitMargin),
          (a.legs ?? []).map((l: any) => `${l.side} ${l.bookmaker} ${l.odds}`).join('; '),
        ]),
      ),
    );
  },
};

async function selectedBookmakers(api: OddsAPIClient): Promise<string> {
  const selected = (await api.getSelectedBookmakers()) as unknown;
  const list = Array.isArray(selected) ? selected : ((selected as { bookmakers?: unknown[] })?.bookmakers ?? []);
  const names = list.map(nameOf).filter(Boolean).slice(0, MAX_ODDS_BOOKMAKERS);
  if (!names.length) {
    throw new UsageError('No bookmakers selected on your account. Pass --bookmakers, for example --bookmakers Bet365,Unibet');
  }
  return names.join(',');
}
