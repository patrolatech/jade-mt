# Initial setup validation — 2026-09-11

Environment: macOS Apple Silicon, Node v24.5.0, pnpm 10.34.5, Cargo/Rust 1.92.0,
Docker 27.4.0, Compose 2.31.0. PostgreSQL/PostGIS ran using the project's Compose
configuration with amd64 emulation. No government APIs or Stellar networks were used.

Every pnpm invocation below was run with the prefix
`COREPACK_HOME=/private/tmp/jade-mt-corepack` because the execution sandbox could not
write Corepack's normal user cache. This prefix is not required in a normal shell.

## Executed checks

| Command                                                                                                                        | Final observed result                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm install`                                                                                                                 | Passed; all 8 workspace projects resolved and pnpm lockfile generated                                |
| `docker compose up -d --wait`                                                                                                  | Passed; PostGIS container healthy                                                                    |
| `pnpm db:migrate`                                                                                                              | Passed; 001-initial.sql applied, subsequent invocations were no-ops                                  |
| `pnpm build`                                                                                                                   | Passed; five libraries, Fastify API, Vite/React bundle                                               |
| `pnpm typecheck`                                                                                                               | Passed; source, test sources, Vite config and Vitest configs                                         |
| `pnpm lint`                                                                                                                    | Passed; includes package import-boundary rules                                                       |
| `pnpm test`                                                                                                                    | Passed; 26 active tests, 4 intentional research skips                                                |
| `pnpm test:integration`                                                                                                        | Passed; 2 tests using real PostgreSQL/PostGIS                                                        |
| `pnpm format`                                                                                                                  | Applied formatting                                                                                   |
| `pnpm format:check`                                                                                                            | Passed after formatting corrections                                                                  |
| `cargo fmt --all`                                                                                                              | Applied Rustfmt                                                                                      |
| `cargo fmt --check`                                                                                                            | Passed                                                                                               |
| `cargo test --workspace`                                                                                                       | Passed; 10 active tests, 1 intentional TTL test ignored                                              |
| `cargo build --release --target wasm32v1-none -p jade-attestation`                                                             | Passed; generated the Wasm artifact                                                                  |
| `pnpm check`                                                                                                                   | Passed as a complete root script, including build, typecheck, lint, formatting, unit and Cargo tests |
| `pnpm dev`                                                                                                                     | Started migrations, package watchers, API on 3000 and Vite on 5173                                   |
| `pnpm smoke`                                                                                                                   | Passed against the development services                                                              |
| `API_PORT=3001 pnpm --filter @jade/api start`                                                                                  | Compiled API started directly in Node                                                                |
| `pnpm smoke http://127.0.0.1:3001 http://127.0.0.1:5173`                                                                       | Passed against the compiled API and Vite                                                             |
| `docker compose ps`                                                                                                            | Project database healthy on 127.0.0.1:5432                                                           |
| `docker compose exec -T postgres psql -U jade -d jade -c 'SELECT postgis_version();' -c 'SELECT name FROM schema_migrations;'` | PostGIS 3.5 and applied 001-initial.sql confirmed                                                    |
| `git diff --check`                                                                                                             | Passed; scaffold files were untracked at validation time                                             |

The pnpm prefix precedes the command, including the compiled API command:
`API_PORT=3001 COREPACK_HOME=/private/tmp/jade-mt-corepack pnpm --filter @jade/api start`.
The extra compiled-API process was stopped after checking it. Normal dev services
and the project database were left available at handoff.

The HTTP smoke script asserts:

- `GET /health` → 200 with the expected body.
- Synthetic `POST /validations` → 501 `RESEARCH_NOT_IMPLEMENTED`.
- Invalid `POST /validations` → 400.
- Vite HTML and transformed React module → 200, with the shared schema import resolved.

The initial equivalent Node-fetch smoke checks also passed before being saved as
`scripts/smoke.mjs`. The page was opened in the in-app browser: the accessibility
tree confirmed the rendered JADE-MT heading, prototype subtitle and four shared
statuses. Package watcher logs reported zero errors and API restarts on shared
package rebuilds.

## Intentional research skips

- A: no intersection → expected PASS.
- B: intersection before cutoff → initially expected PASS.
- C: intersection after cutoff → expected FAIL.
- D: unavailable environmental source → expected INCONCLUSIVE.
- Rust: TTL extension, archival, restoration and costs.

These are not scientific results. Unskipping them requires research implementation;
they cannot silently pass as empty tests. Active contract tests cover authorization,
reads, overwrite prevention, revocation, unauthorized revocation and input errors.

## Failures encountered and resolved

- The sandbox initially blocked registry access, the Docker socket and Corepack's
  normal cache. Dependency/network/container operations were rerun with the granted
  execution permissions and a writable temporary Corepack cache.
- Installed Corepack could not launch pnpm 12's entry point. The repository pins
  compatible stable pnpm 10.34.5. TypeScript 6.0.3 matches ESLint's supported range.
- The first API build failed because Fastify exposes errors as unknown. Explicit
  runtime narrowing fixed the handler; subsequent build and typecheck passed.
- The first Cargo build found an SDK macro ambiguity with `ValidationResult::Error`.
  The source documents the compatibility lint allowance. Native tests and Wasm
  compilation subsequently passed.
- The first Wasm build lacked three cached dependencies and could not access the
  registry inside the sandbox. The authorized retry downloaded them and passed.
- Prettier needed a second formatting pass for the API's chained return expression.
  The final formatting check passed. The smoke script needed an explicit Node URL
  import for ESLint; the final complete `pnpm check` passed.
- One HTTP smoke attempt overlapped a package rebuild and encountered an API
  restart (`ECONNREFUSED`). It passed after the build completed. Run smoke checks
  after the dev servers report ready, not while rebuilding shared exports.

No live TerraBrasilis integration, environmental methodology, canonical evidence
strategy, Stellar transaction, deployed contract, TTL lifecycle or scientific area
calculation was tested. Those remain the documented research work.
