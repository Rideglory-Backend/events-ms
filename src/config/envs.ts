import * as joi from 'joi'

interface EnvVars {
    PORT: number;
    USERS_MS_PORT: number;
    USERS_MS_HOST: string;
    VEHICLES_MS_PORT: number;
    VEHICLES_MS_HOST: string;
    SENTRY_DSN?: string;
    SENTRY_TRACES_SAMPLE_RATE?: number;
    SENTRY_DEV_VERIFY?: string;
}

const envSchema = joi.object({
    PORT: joi.number().required(),
    USERS_MS_PORT: joi.number().required(),
    USERS_MS_HOST: joi.string().required(),
    VEHICLES_MS_PORT: joi.number().required(),
    VEHICLES_MS_HOST: joi.string().required(),
    SENTRY_DSN: joi.string().uri().optional(),
    SENTRY_TRACES_SAMPLE_RATE: joi.number().min(0).max(1).optional(),
    SENTRY_DEV_VERIFY: joi.string().optional(),
}).unknown(true)

const { error, value } = envSchema.validate(process.env);

if (error) {
    throw new Error(`ENV config validation error: ${error.message}`);
}

const envVars: EnvVars = value;

export const envs = {
    port: envVars.PORT,
    usersMsPort: envVars.USERS_MS_PORT,
    usersMsHost: envVars.USERS_MS_HOST,
    vehiclesMsPort: envVars.VEHICLES_MS_PORT,
    vehiclesMsHost: envVars.VEHICLES_MS_HOST,
    sentryDsn: envVars.SENTRY_DSN,
    sentryTracesSampleRate: envVars.SENTRY_TRACES_SAMPLE_RATE,
    sentryDevVerify: envVars.SENTRY_DEV_VERIFY,
}

