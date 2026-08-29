# Schedule Academic Workspace

This is an operational/admin system for deterministic academic timetabling. Reliability, authentication, authorization, and order integrity are more important than refactoring aesthetics.

## Architecture

- **Core Engine:** A deterministic scheduling engine with comprehensive tests verifying schedule conflict correctness, location/building/room integrity, and legacy migration parity.
- **Comprehension Layer:** A Google Gemini-powered comprehension layer that *reads and explains* only. It never writes directly to the database without passing the deterministic validators and obtaining explicit user confirmation.
- **Frontend UI:** Designed for stability and accessibility, preserving legacy-data compatibility and business rules.

## Setup and Testing

- Ensure you use \`npm ci\` for dependency resolution instead of \`npm install\` to preserve Docker reproducibility.
- **Typecheck:** \`npm run lint\`
- **Unit and Regression Tests:** \`npm test\`
- **Gemini Comprehension Layer Tests:** \`npm run test:gemini-layer\`

## Deployment and CI

- **Production Build:** \`npm run build\`
- The project is configured with a strict CI pipeline that ensures all tests, typechecks, and builds pass before any merge. No automated deployments are configured; all deployments must be manual and verified.

## Recovery Documentation

Always use branches and PRs for changes, and maintain a clear rollback plan. Do not redesign the UI or rewrite working scheduling logic unless addressing a defect supported by tests.
