import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { z } from 'zod';

// Zod schema for environment validation
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),

    // OpenSearch
    OPENSEARCH_NODE: z.string().url(),

    // DynamoDB (Membership)
    DYNAMODB_ENDPOINT: z.string().url().optional(),
    AWS_REGION: z.string().default('us-east-1'),

    // PostgreSQL (Locations)
    POSTGRES_HOST: z.string().default('localhost'),
    POSTGRES_PORT: z.string().transform(Number).default('5432'),
    POSTGRES_USER: z.string().default('postgres'),
    POSTGRES_PASSWORD: z.string().default('postgres'),
    POSTGRES_DB: z.string().default('locations'),

    // Auth
    JWT_ISSUER: z.string(),
    JWT_SECRET: z.string().optional(),

    // LLM Provider (Agent)
    LLM_PROVIDER: z.enum(['gemini', 'bedrock']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    BEDROCK_MODEL_ID: z.string().default('anthropic.claude-3-sonnet-20240229-v1:0'),
});

export type EnvConfig = z.infer<typeof envSchema>;

@Global()
@Module({
    imports: [
        NestConfigModule.forRoot({
            envFilePath: ['.env.local', '.env'],
            validate: (config) => {
                const result = envSchema.safeParse(config);
                if (!result.success) {
                    console.error('Invalid environment configuration:');
                    console.error(result.error.format());
                    throw new Error('Invalid environment configuration');
                }
                return result.data;
            },
        }),
    ],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule { }
