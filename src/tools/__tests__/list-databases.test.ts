import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createListDatabasesToolHandler } from '../list-databases.js';
import { ConnectorManager } from '../../connectors/manager.js';

vi.mock('../../connectors/manager.js');

const parseToolResponse = (response: any) => JSON.parse(response.content[0].text);

describe('list_databases tool', () => {
  beforeEach(() => {
    vi.mocked(ConnectorManager.getAllSourceConfigs).mockReturnValue([
      { id: 'db_a', type: 'sqlite', database: ':memory:' } as any,
      { id: 'db_b', type: 'postgres', host: 'localhost', port: 5432, database: 'prod', user: 'app' } as any,
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should list configured database connections', async () => {
    const handler = createListDatabasesToolHandler();
    const result = await handler({}, null);
    const parsed = parseToolResponse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data.count).toBe(2);
    expect(parsed.data.databases[0].id).toBe('db_a');
    expect(parsed.data.databases[1].id).toBe('db_b');
  });

  it('should optionally include tool metadata', async () => {
    const handler = createListDatabasesToolHandler();
    const result = await handler({ include_tools: true }, null);
    const parsed = parseToolResponse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data.databases[0].tools).toBeDefined();
  });
});
