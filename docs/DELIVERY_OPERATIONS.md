# Delivery and Production Operations

These constraints preserve the official service and the college's curriculum rules.

## Official production target

- Domain: `schedule-kw.com`
- Cloud Run: service `schedule`, project `gen-lang-client-0379571946`, region `europe-west1`
- Firestore: project `gen-lang-client-0379571946`, database `ai-studio-schedule-337bbbf5-1098-44cb-aabf-95536daf9106`
- The image registry is for builds. Do not deploy to a different service or project.

## Deployment safeguards

- Never delete, recreate, move, or otherwise change the domain mapping; certificate issuance can interrupt availability.
- A normal release changes the image only. Do not alter the official service account, environment, secrets, or memory settings as part of deployment.
- Do not create a second regional service or delete cloud services/projects or move production data without explicit owner direction.
- Before any script writes to production data, run its preview mode first and review its changes.
- Releases flow through the repository's main branch, CI, and the `Deploy SCHEDULE` workflow. A successful deployment must be verified on `https://schedule-kw.com` and `https://schedule-34704073784.europe-west1.run.app`; both must serve the same build identifier from `/sw.js`.

## Academic curriculum rules

The complete approved rules are in [`CURRICULUM_SHEET_RULES.md`](CURRICULUM_SHEET_RULES.md). Preserve department-only visibility, cross-department prerequisite notes, the official sheet categories, service-course behavior, level and arrow colors, the two tracks per department, the shared girls' sheet, and the student's complete personal map. Do not change these rules without owner direction.

## Data and credentials

Do not include local database snapshots or production credentials in source control or delivery archives. Configure runtime access using private environment variables or the platform's managed identity. Keep local environment files, service-account keys, vault keys, and user exports outside the project.
