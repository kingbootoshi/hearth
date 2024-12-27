import pino from 'pino';

// Configure the logger
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
});

// Create child loggers for different modules
export function createModuleLogger(moduleName: string) {
  return logger.child({ 
    module: moduleName,
    // Add any module-specific configuration here
  });
} 