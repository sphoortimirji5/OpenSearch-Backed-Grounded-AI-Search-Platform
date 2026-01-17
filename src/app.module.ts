/**
 * @fileoverview Application Root Module
 *
 * Configures the NestJS application with logging, metrics, and feature modules.
 */

import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './config/config.module';
import { SharedAuthModule } from './shared/auth';
import { MembershipModule } from './membership';
import { LocationsModule } from './locations';
import { AgentModule } from './agent';
import { LocationEntity } from './locations/entities';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
    imports: [
        // Logging
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
                transport: process.env.NODE_ENV !== 'production'
                    ? { target: 'pino-pretty' }
                    : undefined,
                redact: ['req.headers.authorization', 'res.headers["set-cookie"]'],
            },
        }),

        // Metrics
        PrometheusModule.register({
            path: '/metrics',
            defaultMetrics: { enabled: true },
        }),

        // TypeORM for PostgreSQL (Locations)
        TypeOrmModule.forRootAsync({
            imports: [NestConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const isProduction = config.get('NODE_ENV') === 'production';
                const password = config.get('POSTGRES_PASSWORD');

                // SECURITY: Require explicit password in production
                if (isProduction && !password) {
                    throw new Error(
                        'CRITICAL: POSTGRES_PASSWORD must be set in production'
                    );
                }

                return {
                    type: 'postgres',
                    host: config.get('POSTGRES_HOST', 'localhost'),
                    port: config.get('POSTGRES_PORT', 5432),
                    username: config.get('POSTGRES_USER', 'postgres'),
                    password: password || 'postgres', // Default only for local dev
                    database: config.get('POSTGRES_DB', 'locations'),
                    entities: [LocationEntity],
                    // SECURITY: Never synchronize schema in production
                    synchronize: !isProduction,
                    logging: !isProduction,
                };
            },
        }),

        // Shared modules
        ConfigModule,
        SharedAuthModule,

        // Feature modules
        MembershipModule,
        LocationsModule,
        AgentModule,
    ],
})
export class AppModule { }
