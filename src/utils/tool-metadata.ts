import { z } from "zod";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { ConnectorManager } from "../connectors/manager.js";
import { executeSqlSchema } from "../tools/execute-sql.js";
import { listDatabasesSchema } from "../tools/list-databases.js";
import { searchDatabaseObjectsSchema } from "../tools/search-objects.js";
import { getToolRegistry } from "../tools/registry.js";
import { BUILTIN_TOOL_EXECUTE_SQL, BUILTIN_TOOL_SEARCH_OBJECTS } from "../tools/builtin-tools.js";
import type { ParameterConfig, ToolConfig } from "../types/config.js";

/**
 * Tool parameter definition for API responses
 */
export interface ToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

/**
 * Tool metadata for API responses
 */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  statement?: string;
  readonly?: boolean;
  max_rows?: number;
}

/**
 * Tool metadata with Zod schema (used internally for registration)
 */
export interface ToolMetadata {
  name: string;
  description: string;
  schema: Record<string, z.ZodType<any>>;
  annotations: ToolAnnotations;
}

/**
 * Convert a Zod schema object to simplified parameter list
 * @param schema - Zod schema object (e.g., { sql: z.string().describe("...") })
 * @returns Array of tool parameters
 */
export function zodToParameters(schema: Record<string, z.ZodType<any>>): ToolParameter[] {
  const parameters: ToolParameter[] = [];

  for (const [key, zodType] of Object.entries(schema)) {
    // Extract description from Zod schema
    const description = zodType.description || "";

    // Determine if required (Zod types are required by default unless optional)
    const required = !(zodType instanceof z.ZodOptional) && !(zodType instanceof z.ZodDefault);

    // Determine type from Zod type
    let type = "string"; // default
    if (zodType instanceof z.ZodString) {
      type = "string";
    } else if (zodType instanceof z.ZodNumber) {
      type = "number";
    } else if (zodType instanceof z.ZodBoolean) {
      type = "boolean";
    } else if (zodType instanceof z.ZodArray) {
      type = "array";
    } else if (zodType instanceof z.ZodObject) {
      type = "object";
    }

    parameters.push({
      name: key,
      type,
      required,
      description,
    });
  }

  return parameters;
}

/**
 * Get execute_sql tool metadata for a specific source
 * @param sourceId - The source ID to get tool metadata for
 * @returns Tool metadata with name, description, and Zod schema
 */
export function getExecuteSqlMetadata(sourceId?: string): ToolMetadata {
  const sourceIds = ConnectorManager.getAvailableSourceIds();
  const sourceConfig = sourceId ? ConnectorManager.getSourceConfig(sourceId)! : ConnectorManager.getSourceConfig()!;
  const dbType = sourceConfig.type;

  // Get tool configuration from registry to extract readonly/max_rows
  const registry = getToolRegistry();
  const toolConfig = sourceId ? registry.getBuiltinToolConfig(BUILTIN_TOOL_EXECUTE_SQL, sourceId) : undefined;
  const executeOptions = {
    readonly: toolConfig?.readonly,
    maxRows: toolConfig?.max_rows,
  };

  const title = sourceId
    ? `Execute SQL on ${sourceId} (${dbType})`
    : sourceIds.length === 1
      ? `Execute SQL (${dbType})`
      : "Execute SQL Across Databases";

  const readonlyNote = executeOptions.readonly ? " [READ-ONLY MODE]" : "";
  const maxRowsNote = executeOptions.maxRows ? ` (limited to ${executeOptions.maxRows} rows)` : "";
  const description = sourceId
    ? `Execute SQL queries on database '${sourceId}' (${dbType})${readonlyNote}${maxRowsNote}. Provide database_id when calling the shared tool.`
    : sourceIds.length === 1
    ? `Execute SQL queries on the ${dbType} database${readonlyNote}${maxRowsNote}`
    : `Execute SQL queries on a configured database${readonlyNote}${maxRowsNote}. Provide database_id to select the target database.`;

  // Build annotations object with all standard MCP hints
  const isReadonly = executeOptions.readonly === true;
  const annotations = {
    title,
    readOnlyHint: isReadonly,
    destructiveHint: !isReadonly, // Can be destructive if not readonly
    // In readonly mode, queries are more predictable (though still not strictly idempotent due to data changes)
    // In write mode, queries are definitely not idempotent
    idempotentHint: false,
    // Database operations are always against internal/closed systems, not open-world
    openWorldHint: false,
  };

  return {
    name: "execute_sql",
    description,
    schema: executeSqlSchema,
    annotations,
  };
}

/**
 * Get search_objects tool metadata for a specific source
 * @param sourceId - The source ID to get tool metadata for
 * @returns Tool name, description, and annotations
 */
export function getSearchObjectsMetadata(sourceId?: string): { name: string; description: string; title: string; schema: Record<string, z.ZodType<any>>; annotations: ToolAnnotations } {
  const sourceIds = ConnectorManager.getAvailableSourceIds();
  const sourceConfig = sourceId ? ConnectorManager.getSourceConfig(sourceId)! : ConnectorManager.getSourceConfig()!;
  const dbType = sourceConfig.type;

  const title = sourceId
    ? `Search Database Objects on ${sourceId} (${dbType})`
    : sourceIds.length === 1
      ? `Search Database Objects (${dbType})`
      : "Search Database Objects Across Databases";
  const description = sourceId
    ? `Search and list database objects on database '${sourceId}' (${dbType}). Provide database_id when calling the shared tool.`
    : sourceIds.length === 1
      ? `Search and list database objects (schemas, tables, columns, procedures, functions, indexes) on the ${dbType} database`
      : `Search and list database objects (schemas, tables, columns, procedures, functions, indexes) on a configured database. Provide database_id to select the target database.`;

  return {
    name: "search_objects",
    description,
    title,
    schema: searchDatabaseObjectsSchema,
    annotations: {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
}

export function getListDatabasesMetadata(): ToolMetadata {
  const title = "List Configured Databases";
  const description = "List all configured database connections in the current DBHub service.";

  return {
    name: "list_databases",
    description,
    schema: listDatabasesSchema,
    annotations: {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
}

/**
 * Convert custom tool parameter configs to Tool parameter format
 * @param params - Parameter configurations from custom tool
 * @returns Array of tool parameters
 */
function customParamsToToolParams(params: ParameterConfig[] | undefined): ToolParameter[] {
  if (!params || params.length === 0) {
    return [];
  }

  return params.map((param) => ({
    name: param.name,
    type: param.type,
    required: param.required !== false && param.default === undefined,
    description: param.description,
  }));
}

/**
 * Build execute_sql tool metadata for API response
 */
function buildExecuteSqlTool(sourceId: string, toolConfig?: ToolConfig): Tool {
  const executeSqlMetadata = getExecuteSqlMetadata(sourceId);
  const executeSqlParameters = zodToParameters(executeSqlMetadata.schema);

  // Extract readonly and max_rows from toolConfig
  // ToolConfig is a union type, but ExecuteSqlToolConfig and CustomToolConfig both have these fields
  const readonly = toolConfig && 'readonly' in toolConfig ? toolConfig.readonly : undefined;
  const max_rows = toolConfig && 'max_rows' in toolConfig ? toolConfig.max_rows : undefined;

  return {
    name: executeSqlMetadata.name,
    description: executeSqlMetadata.description,
    parameters: executeSqlParameters,
    readonly,
    max_rows,
  };
}

/**
 * Build search_objects tool metadata for API response
 */
function buildSearchObjectsTool(sourceId: string): Tool {
  const searchMetadata = getSearchObjectsMetadata(sourceId);
  const registry = getToolRegistry();
  const toolConfig = registry.getBuiltinToolConfig(BUILTIN_TOOL_SEARCH_OBJECTS, sourceId);

  return {
    name: searchMetadata.name,
    description: searchMetadata.description,
    parameters: zodToParameters(searchMetadata.schema),
    readonly: !!toolConfig,
  };
}

/**
 * Build custom tool metadata for API response
 */
function buildCustomTool(toolConfig: ToolConfig): Tool {
  return {
    name: toolConfig.name,
    description: toolConfig.description!,
    parameters: customParamsToToolParams(toolConfig.parameters),
    statement: toolConfig.statement,
    readonly: toolConfig.readonly,
    max_rows: toolConfig.max_rows,
  };
}

/**
 * Get tools for a specific source (API response format)
 * Only includes tools that are actually enabled in the ToolRegistry
 * @param sourceId - The source ID to get tools for
 * @returns Array of enabled tools with simplified parameters
 */
export function getToolsForSource(sourceId: string): Tool[] {
  // Get enabled tools from registry
  const registry = getToolRegistry();
  const enabledToolConfigs = registry.getEnabledToolConfigs(sourceId);

  // Uniform iteration: map each enabled tool config to its API representation
  return enabledToolConfigs.map((toolConfig) => {
    // Dispatch based on tool name
    if (toolConfig.name === "execute_sql") {
      return buildExecuteSqlTool(sourceId, toolConfig);
    } else if (toolConfig.name === "search_objects") {
      return buildSearchObjectsTool(sourceId);
    } else {
      // Custom tool
      return buildCustomTool(toolConfig);
    }
  });
}
