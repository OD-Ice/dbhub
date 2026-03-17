import { z } from "zod";
import { ConnectorManager } from "../connectors/manager.js";
import { createToolSuccessResponse } from "../utils/response-formatter.js";
import { trackToolRequest } from "../utils/tool-handler-helpers.js";

export const listDatabasesSchema = {
  include_tools: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include enabled tool metadata for each configured database"),
};

export function createListDatabasesToolHandler() {
  return async (args: any, extra: any) => {
    const { include_tools = false } = args as { include_tools?: boolean };
    const startTime = Date.now();

    try {
      const sources = ConnectorManager.getAllSourceConfigs();
      const { getToolsForSource } = await import("../utils/tool-metadata.js");

      const databases = sources.map((source) => ({
        id: source.id,
        type: source.type,
        description: source.description,
        host: source.host,
        port: source.port,
        database: source.database,
        user: source.user,
        ...(include_tools ? { tools: getToolsForSource(source.id) } : {}),
      }));

      return createToolSuccessResponse({
        count: databases.length,
        databases,
      });
    } finally {
      trackToolRequest(
        {
          sourceId: "system",
          toolName: "list_databases",
          sql: `list_databases(include_tools=${include_tools})`,
        },
        startTime,
        extra,
        true
      );
    }
  };
}
