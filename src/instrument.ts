// Must be the FIRST import in main.ts — before dotenv/config and @nestjs/core
// so that Sentry can instrument NestJS correctly.
// NOTE: Do NOT import `envs` here — envs.ts runs joi validation at module-load
// time, but dotenv/config is imported on line 2 of main.ts (after this file is
// fully evaluated). Reading process.env directly avoids the premature crash.
import 'dotenv/config';
import { initSentry } from '@rideglory/common-lib';

const sentryDsn = process.env['SENTRY_DSN'];
const sentryRate = process.env['SENTRY_TRACES_SAMPLE_RATE'];

initSentry('events-ms', sentryDsn, {
  tracesSampleRate: sentryRate ? Number(sentryRate) : undefined,
});
