# Changelog

## 0.1.3 (2026-11-13)

- Docs: `--help` and the README link to the market reference at https://odds-api.io/markets for `--market` names.

## 0.1.2

First release published from GitHub Actions with npm/PyPI trusted publishing and provenance. No code changes.

## 0.1.1

- Fix: `value-bets` showed the EV column 100 times too large. `expectedValue` is bookmaker odds / fair odds x 100, so the column now shows the edge as `expectedValue - 100` (103.42 shows as 3.42%).
- Fix: `arbitrage` showed the Profit column 100 times too large. `profitMargin` is already a percentage and is now shown as is.
- New: `value-bets --min-ev <percent>` keeps only bets with at least that edge, for example `--min-ev 3`.

## 0.1.0

- First release: `sports`, `bookmakers`, `events`, `odds`, `value-bets` and `arbitrage` commands.
