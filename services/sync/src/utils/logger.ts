/**
 * Logger - настройка pino для структурированного логирования
 */

import pino from "pino";
import { config } from "../config/index.js";

// Always write to stderr — stdout is reserved for the MCP stdio JSON-RPC protocol.
const transport = config.nodeEnv === "development"
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        destination: 2  // stderr fd
      }
    }
  : {
      target: "pino/file",
      options: { destination: 2 }  // stderr fd
    };

const baseLogger = pino({
  level: config.logLevel,
  transport
});

export function createLogger(name: string) {
  return baseLogger.child({ module: name });
}

export default baseLogger;
