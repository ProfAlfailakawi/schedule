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

## Firestore target selection (project and database)

The server picks its Firestore project/database in `src/server/firestoreTarget.ts`, applied by `src/server/runtimeEnv.ts`.

- **Current precedence (unchanged):** on Cloud Run `firebase-applet-config.json` wins over `FIREBASE_PROJECT_ID` / `FIREBASE_DATABASE_ID`; elsewhere the environment wins. A Cloud Run environment value that differs from the file is logged as a warning (it does not take effect).
- **Production never falls back to `(default)`.** On Cloud Run the server refuses to connect when the project or database id is missing or `(default)`.
- **Startup log:** `[firestore-target] project=… database=… source=…` shows the target actually used.
- `FIREBASE_CONFIG_SOURCE=environment` (Cloud Run only, off by default) makes the environment the single source: both ids must be set and the file may not contradict them.

### Phase 2 (not yet applied): remove the database name from source files

Do this only after read-only confirmation that the `schedule` service carries the correct `FIREBASE_PROJECT_ID` and `FIREBASE_DATABASE_ID` (`gcloud run services describe schedule --region=europe-west1 --project=gen-lang-client-0379571946 --format='value(spec.template.spec.containers[0].env)'`). Deployments change the image only, so these variables are set on the service itself, never by the deploy workflow.

1. Confirm the variables on the live service, and that the startup log of the current revision shows the production database.
2. Set `FIREBASE_CONFIG_SOURCE=environment` on a no-traffic revision first and confirm the same `database=` in its log.
3. Only then drop `firestoreDatabaseId` from the checked-in config files.

**Rollback:** route traffic back to the previous revision (`gcloud run services update-traffic schedule --to-revisions=<previous>=100`); remove `FIREBASE_CONFIG_SOURCE` to restore file precedence. No data is moved, copied or renamed at any step.

## Academic curriculum rules

The complete approved rules are in [`CURRICULUM_SHEET_RULES.md`](CURRICULUM_SHEET_RULES.md). Preserve department-only visibility, cross-department prerequisite notes, the official sheet categories, service-course behavior, level and arrow colors, the two tracks per department, the shared girls' sheet, and the student's complete personal map. Do not change these rules without owner direction.

## Data and credentials

Do not include local database snapshots or production credentials in source control or delivery archives. Configure runtime access using private environment variables or the platform's managed identity. Keep local environment files, service-account keys, vault keys, and user exports outside the project.
