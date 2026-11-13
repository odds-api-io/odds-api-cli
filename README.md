# odds-api-cli

[![npm version](https://img.shields.io/npm/v/odds-api-cli.svg)](https://www.npmjs.com/package/odds-api-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Command-line client for the [Odds-API.io](https://odds-api.io) sports betting odds API. List sports, events and bookmakers, compare live and pre-match odds, and find value bets and arbitrage from 450+ bookmakers across 34 sports, straight from your terminal.

Built on the official [Node.js SDK](https://github.com/odds-api-io/odds-api-node).

## Quickstart

```bash
npm install -g odds-api-cli
export ODDS_API_KEY="your-api-key"

odds-api events --sport football --league england-premier-league
odds-api odds 123456 --bookmakers Bet365,Unibet
```

Or run it without installing:

```bash
npx odds-api-cli sports
```

## Get an API key

The odds API needs a key from a paid plan. Pick a plan at [odds-api.io/pricing](https://odds-api.io/pricing?ref=npm), then set it as `ODDS_API_KEY` or pass `--key <key>` to any command.

`sports` and `bookmakers` work without a key.

## Commands

| Command | What it does |
|---------|--------------|
| `odds-api sports` | List sports and their slugs |
| `odds-api bookmakers` | List bookmakers |
| `odds-api events --sport <slug>` | List events. Filters: `--league <slug>`, `--status pending,live,settled`, `--from <iso>`, `--to <iso>`, `--limit <n>` |
| `odds-api odds <eventId>` | Odds for one event. `--bookmakers Bet365,Unibet` (defaults to the bookmakers selected on your account), `--market ML,Totals` (market names per sport: [odds-api.io/markets](https://odds-api.io/markets)) |
| `odds-api value-bets --bookmaker <name>` | Value bets for a bookmaker, highest expected value first. The EV column is the edge in percent (`expectedValue - 100`, so an `expectedValue` of 103.4 shows as 3.40%). Filters: `--sport`, `--league`, `--min-ev <percent>`, `--limit` |
| `odds-api arbitrage --bookmakers <a,b>` | Arbitrage opportunities across bookmakers. The Profit column is `profitMargin`, already a percentage. `--limit <n>` |

Global options:

| Option | Description |
|--------|-------------|
| `--key <key>` | API key. Defaults to the `ODDS_API_KEY` environment variable |
| `--json` | Print the raw JSON response instead of a table |
| `-h, --help` | Show help |
| `-v, --version` | Show the version |

## Examples

```bash
# Live NBA games
odds-api events --sport basketball --league usa-nba --status live

# Totals odds from two bookmakers
odds-api odds 123456 --bookmakers Bet365,DraftKings --market Totals

# Top 10 value bets on Bet365 for MLB
odds-api value-bets --bookmaker Bet365 --sport baseball --league usa-mlb --limit 10

# Value bets on Bet365 with at least a 3% edge
odds-api value-bets --bookmaker Bet365 --min-ev 3

# Arbitrage between three bookmakers, as JSON for jq
odds-api arbitrage --bookmakers Bet365,FanDuel,Unibet --json | jq '.[0]'
```

## Sports and bookmakers

34 sports, including football (soccer), basketball, American football, baseball, ice hockey, tennis and esports, with odds from 450+ bookmakers such as Bet365, DraftKings, FanDuel, Betfair and Unibet. See the [full coverage list](https://odds-api.io/sportsbooks#coverage).

## Documentation

- [CLI guide: install, commands and examples](https://docs.odds-api.io/guides/cli)
- [Quickstart: make your first request](https://docs.odds-api.io/quickstart)
- [Find value bets](https://docs.odds-api.io/guides/value-bets) and [arbitrage opportunities](https://docs.odds-api.io/guides/arbitrage-bets)
- [Full API reference](https://docs.odds-api.io/api-reference/introduction)
- [Node.js SDK](https://github.com/odds-api-io/odds-api-node) and [Python SDK](https://github.com/odds-api-io/odds-api-python)
- [MCP server](https://github.com/odds-api-io/odds-api-mcp-server) for Claude, Cursor and other AI agents

## Development

```bash
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
