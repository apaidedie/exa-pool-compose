# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses semantic versioning where practical.

## [Unreleased]

### Added

- Placeholder section for upcoming changes.

## [v1.0.0] - 2026-03-09

### Added

- Added local `Node.js + SQLite` deployment while preserving the original `worker.js` core logic.
- Added `server.js` to bridge local HTTP requests into `worker.fetch()`.
- Added `d1-sqlite.js` to provide a D1-compatible SQLite adapter for `prepare().bind().first().all().run()`.
- Added `.env.example` for local configuration.
- Added `Dockerfile` and `docker-compose.yml` for containerized deployment.
- Added `smoke-test.js` for local smoke testing.
- Added GitHub Actions CI workflow for smoke test validation.
- Added GitHub Actions workflow to build and publish Docker images to `GHCR`.

### Changed

- Updated `README.md` with quick start, Docker Compose usage, GHCR image usage, and deployment guidance.
- Switched `docker-compose.yml` to use the published `GHCR` image directly.
- Updated repository metadata for public distribution, including release publication and GitHub repository presentation.

### Notes

- Upstream project reference: `https://github.com/chengtx809/exa-pool`

