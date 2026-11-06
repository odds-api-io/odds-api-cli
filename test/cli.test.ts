import { describe, it, expect, vi, afterEach } from 'vitest';
import { run, type IO } from '../src/run';

type Route = { match: (url: URL) => boolean; body: unknown; status?: number };

function mockApi(routes: Route[]) {
  const calls: URL[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    const route = routes.find((r) => r.match(url));
    if (!route) return new Response('{"error":"not mocked"}', { status: 500 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

const path = (p: string) => (url: URL) => url.pathname.endsWith(p);

async function cli(argv: string[], env: Record<string, string> = { ODDS_API_KEY: 'test-key' }) {
  const out: string[] = [];
  const err: string[] = [];
  const io: IO = { out: (t) => out.push(t), err: (t) => err.push(t), env };
  const code = await run(argv, io);
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const EVENT = {
  id: 123456,
  home: 'Manchester United',
  away: 'Liverpool',
  date: '2026-11-08T15:00:00Z',
  status: 'pending',
  sport: { name: 'Football', slug: 'football' },
  league: { name: 'England - Premier League', slug: 'england-premier-league' },
};

describe('help and version', () => {
  it('prints help without a command', async () => {
    const { code, stdout } = await cli([]);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
    expect(stdout).toContain('https://odds-api.io/pricing');
  });

  it('prints the package version', async () => {
    const { code, stdout } = await cli(['--version']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rejects unknown commands with exit code 2', async () => {
    const { code, stderr } = await cli(['nope']);
    expect(code).toBe(2);
    expect(stderr).toContain('Unknown command: nope');
  });

  it('rejects unknown options with exit code 2', async () => {
    const { code } = await cli(['sports', '--nope']);
    expect(code).toBe(2);
  });
});

describe('API key', () => {
  it('explains how to get a key when it is missing', async () => {
    const calls = mockApi([]);
    const { code, stderr } = await cli(['events', '--sport', 'football'], {});
    expect(code).toBe(1);
    expect(stderr).toContain('ODDS_API_KEY');
    expect(stderr).toContain('https://odds-api.io/pricing');
    expect(calls).toHaveLength(0);
  });

  it('uses --key over the environment variable', async () => {
    const calls = mockApi([{ match: path('/events'), body: [] }]);
    await cli(['events', '--sport', 'football', '--key', 'flag-key']);
    expect(calls[0].searchParams.get('apiKey')).toBe('flag-key');
  });

  it('reports a rejected key', async () => {
    mockApi([{ match: path('/events'), body: { error: 'Invalid API key' }, status: 401 }]);
    const { code, stderr } = await cli(['events', '--sport', 'football']);
    expect(code).toBe(1);
    expect(stderr).toContain('rejected');
    expect(stderr).toContain('https://odds-api.io/pricing');
  });

  it('does not need a key for sports', async () => {
    mockApi([{ match: path('/sports'), body: [{ name: 'Football', slug: 'football' }] }]);
    const { code } = await cli(['sports'], {});
    expect(code).toBe(0);
  });
});

describe('sports and bookmakers', () => {
  it('renders sports as a table', async () => {
    mockApi([{ match: path('/sports'), body: [{ name: 'Football', slug: 'football' }, { name: 'Ice Hockey', slug: 'ice-hockey' }] }]);
    const { stdout } = await cli(['sports']);
    expect(stdout.split('\n')[0]).toMatch(/^Sport\s+Slug$/);
    expect(stdout).toContain('ice-hockey');
  });

  it('prints raw JSON with --json', async () => {
    const body = [{ name: 'Bet365', active: true }];
    mockApi([{ match: path('/bookmakers'), body }]);
    const { stdout } = await cli(['bookmakers', '--json']);
    expect(JSON.parse(stdout)).toEqual(body);
  });
});

describe('events', () => {
  it('passes filters and renders events', async () => {
    const calls = mockApi([{ match: path('/events'), body: [{ ...EVENT, scores: { home: 2, away: 1 } }] }]);
    const { code, stdout } = await cli([
      'events', '--sport', 'football', '--league', 'england-premier-league', '--status', 'live', '--limit', '5',
    ]);
    expect(code).toBe(0);
    const q = calls[0].searchParams;
    expect(q.get('sport')).toBe('football');
    expect(q.get('league')).toBe('england-premier-league');
    expect(q.get('status')).toBe('live');
    expect(q.get('limit')).toBe('5');
    expect(stdout).toContain('Manchester United vs Liverpool');
    expect(stdout).toContain('2026-11-08 15:00Z');
    expect(stdout).toContain('2-1');
  });

  it('requires --sport', async () => {
    const { code, stderr } = await cli(['events']);
    expect(code).toBe(2);
    expect(stderr).toContain('--sport');
  });

  it('validates --limit', async () => {
    const { code } = await cli(['events', '--sport', 'football', '--limit', 'abc']);
    expect(code).toBe(2);
  });
});

describe('odds', () => {
  const ODDS = {
    ...EVENT,
    bookmakers: {
      Bet365: [
        { name: 'ML', odds: [{ home: '2.10', draw: '3.40', away: '3.20' }] },
        { name: 'Totals', odds: [{ hdp: 2.5, over: '1.90', under: '1.90' }] },
      ],
    },
  };

  it('fetches odds for the given bookmakers', async () => {
    const calls = mockApi([{ match: path('/odds'), body: ODDS }]);
    const { code, stdout } = await cli(['odds', '123456', '--bookmakers', 'Bet365,Unibet']);
    expect(code).toBe(0);
    expect(calls[0].searchParams.get('eventId')).toBe('123456');
    expect(calls[0].searchParams.get('bookmakers')).toBe('Bet365,Unibet');
    expect(stdout).toContain('Manchester United vs Liverpool');
    expect(stdout).toContain('home 2.10, draw 3.40, away 3.20');
    expect(stdout).toContain('over 1.90, under 1.90');
  });

  it('filters markets with --market', async () => {
    mockApi([{ match: path('/odds'), body: ODDS }]);
    const { stdout } = await cli(['odds', '123456', '--bookmakers', 'Bet365', '--market', 'totals']);
    expect(stdout).toContain('over 1.90');
    expect(stdout).not.toContain('draw 3.40');
  });

  it('falls back to the account selected bookmakers', async () => {
    const calls = mockApi([
      { match: path('/bookmakers/selected'), body: { bookmakers: ['Bet365', 'SingBet'], count: 2 } },
      { match: path('/odds'), body: ODDS },
    ]);
    const { code } = await cli(['odds', '123456']);
    expect(code).toBe(0);
    expect(calls[1].searchParams.get('bookmakers')).toBe('Bet365,SingBet');
  });

  it('requires an event ID', async () => {
    const { code, stderr } = await cli(['odds']);
    expect(code).toBe(2);
    expect(stderr).toContain('event ID');
  });
});

describe('value bets and arbitrage', () => {
  it('sorts value bets by expected value', async () => {
    const calls = mockApi([
      {
        match: path('/value-bets'),
        body: [
          { eventId: 1, bookmaker: 'Bet365', market: { name: 'ML' }, betSide: 'away', expectedValue: 0.01, bookmakerOdds: { away: '3.20' }, event: EVENT },
          { eventId: 2, bookmaker: 'Bet365', market: { name: 'Totals', hdp: 2.5 }, betSide: 'over', expectedValue: 0.0523, bookmakerOdds: { over: '2.10' }, event: EVENT },
        ],
      },
    ]);
    const { code, stdout } = await cli(['value-bets', '--bookmaker', 'Bet365', '--sport', 'football']);
    expect(code).toBe(0);
    expect(calls[0].searchParams.get('bookmaker')).toBe('Bet365');
    expect(calls[0].searchParams.get('sport')).toBe('football');
    expect(calls[0].searchParams.get('includeEventDetails')).toBe('true');
    const lines = stdout.split('\n');
    expect(lines[2]).toContain('Totals 2.5');
    expect(lines[2]).toContain('5.23%');
    expect(lines[3]).toContain('1.00%');
  });

  it('requires --bookmaker for value bets', async () => {
    const { code } = await cli(['value-bets']);
    expect(code).toBe(2);
  });

  it('renders arbitrage legs and profit', async () => {
    const calls = mockApi([
      {
        match: path('/arbitrage-bets'),
        body: [
          {
            eventId: 123456,
            market: { name: 'ML', hdp: null },
            profitMargin: 0.0215,
            legs: [
              { side: 'home', bookmaker: 'Bet365', odds: '2.15' },
              { side: 'away', bookmaker: 'SingBet', odds: '2.10' },
            ],
            event: EVENT,
          },
        ],
      },
    ]);
    const { code, stdout } = await cli(['arbitrage', '--bookmakers', 'Bet365,SingBet', '--limit', '10']);
    expect(code).toBe(0);
    expect(calls[0].searchParams.get('bookmakers')).toBe('Bet365,SingBet');
    expect(calls[0].searchParams.get('limit')).toBe('10');
    expect(stdout).toContain('2.15%');
    expect(stdout).toContain('home Bet365 2.15; away SingBet 2.10');
  });
});
