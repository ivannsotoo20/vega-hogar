import { env } from './config/env.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`vega-hogar motor listening on :${env.PORT} (${env.NODE_ENV})`);
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start motor');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
