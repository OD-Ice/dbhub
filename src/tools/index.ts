import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createExecuteSqlToolHandler } from "./execute-sql.js";
import { createSearchDatabaseObjectsToolHandler, searchDatabaseObjectsSchema } from "./search-objects.js";
import { createListDatabasesToolHandler, listDatabasesSchema } from "./list-databases.js";
import { ConnectorManager } from "../connectors/manager.js";
import { getExecuteSqlMetadata, getListDatabasesMetadata, getSearchObjectsMetadata } from "../utils/tool-metadata.js";
import { isReadOnlySQL } from "../utils/allowed-keywords.js";
import { createCustomToolHandler, buildZodSchemaFromParameters } from "./custom-tool-handler.js";
import type { ToolConfig } from "../types/config.js";
import { getToolRegistry } from "./registry.js";
import { BUILTIN_TOOL_EXECUTE_SQL, BUILTIN_TOOL_SEARCH_OBJECTS } from "./builtin-tools.js";

/**
 * Register all tool handlers with the MCP server
 * Iterates through all enabled tools from the registry and registers them
 * @param server - The MCP server instance
 */
export function registerTools(server: McpServer): void {
  if (ConnectorManager.getAvailableSourceIds().length === 0) {
    throw new Error("No database sources configured");
  }

  const registry = getToolRegistry();
  const enabledBuiltinTools = registry.getEnabledBuiltinToolNames();

  if (enabledBuiltinTools.includes(BUILTIN_TOOL_EXECUTE_SQL)) {
    registerExecuteSqlTool(server);
  }
  if (enabledBuiltinTools.includes(BUILTIN_TOOL_SEARCH_OBJECTS)) {
    registerSearchObjectsTool(server);
  }
  registerListDatabasesTool(server);

  // Register custom tools per source
  for (const sourceId of ConnectorManager.getAvailableSourceIds()) {
    const enabledTools = registry.getEnabledToolConfigs(sourceId);

    for (const toolConfig of enabledTools) {
      if (
        toolConfig.name !== BUILTIN_TOOL_EXECUTE_SQL &&
        toolConfig.name !== BUILTIN_TOOL_SEARCH_OBJECTS
      ) {
        registerCustomTool(server, sourceId, toolConfig);
      }
    }
  }
}

/**
 * Register execute_sql tool for a source
 */
function registerExecuteSqlTool(
  server: McpServer
): void {
  const metadata = getExecuteSqlMetadata();
  server.registerTool(
    metadata.name,
    {
      description: metadata.description,
      inputSchema: metadata.schema,
      annotations: metadata.annotations,
    },
    createExecuteSqlToolHandler()
  );
}

/**
 * Register search_objects tool for a source
 */
function registerSearchObjectsTool(
  server: McpServer
): void {
  const metadata = getSearchObjectsMetadata();

  server.registerTool(
    metadata.name,
    {
      description: metadata.description,
      inputSchema: searchDatabaseObjectsSchema,
      annotations: {
        title: metadata.title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createSearchDatabaseObjectsToolHandler()
  );
}

/**
 * Register list_databases tool
 */
function registerListDatabasesTool(server: McpServer): void {
  const metadata = getListDatabasesMetadata();

  server.registerTool(
    metadata.name,
    {
      description: metadata.description,
      inputSchema: listDatabasesSchema,
      annotations: metadata.annotations,
    },
    createListDatabasesToolHandler()
  );
}

/**
 * Register a custom tool
 */
function registerCustomTool(
  server: McpServer,
  sourceId: string,
  toolConfig: ToolConfig
): void {
  const sourceConfig = ConnectorManager.getSourceConfig(sourceId)!;
  const dbType = sourceConfig.type;

  const isReadOnly = isReadOnlySQL(toolConfig.statement!, dbType);
  const zodSchema = buildZodSchemaFromParameters(toolConfig.parameters);

  server.registerTool(
    toolConfig.name,
    {
      description: toolConfig.description,
      inputSchema: zodSchema,
      annotations: {
        title: `${toolConfig.name} (${dbType})`,
        readOnlyHint: isReadOnly,
        destructiveHint: !isReadOnly,
        idempotentHint: isReadOnly,
        openWorldHint: false,
      },
    },
    createCustomToolHandler(toolConfig)
  );
}
