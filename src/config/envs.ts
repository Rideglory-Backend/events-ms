import * as joi from 'joi'

interface EnvVars {
    PORT: number;
    USERS_MS_PORT: number;
    USERS_MS_HOST: string;
    VEHICLES_MS_PORT: number;
    VEHICLES_MS_HOST: string;
}

const envSchema = joi.object({
    PORT: joi.number().required(),
    USERS_MS_PORT: joi.number().required(),
    USERS_MS_HOST: joi.string().required(),
    VEHICLES_MS_PORT: joi.number().required(),
    VEHICLES_MS_HOST: joi.string().required(),
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
}

