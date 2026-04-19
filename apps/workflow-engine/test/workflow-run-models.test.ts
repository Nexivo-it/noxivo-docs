import { describe, expect, it } from 'vitest';
import * as databaseModule from '@noxivo/database';

describe('workflow run model exports', () => {
  it('exposes the canonical workflow run model from workflow-execution only', () => {
    expect(databaseModule.WorkflowRunModel.collection.collectionName).toBe('workflow_runs');
    expect(databaseModule.WorkflowRunModel.schema.path('agencyId')).toBeDefined();
    expect(databaseModule.WorkflowRunModel.schema.path('workflowRunId')).toBeDefined();
    expect('WorkflowRunStateModel' in databaseModule).toBe(false);
  });
});
