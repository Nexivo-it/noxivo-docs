import type { WorkflowEditorGraph, CompiledDag } from '@noxivo/contracts';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'crm' | 'automation' | 'support';
  plugins: string[];
  editorGraph: WorkflowEditorGraph;
  compiledDag: CompiledDag;
}

export const airtableLeadSyncTemplate: WorkflowTemplate = {
  id: 'airtable-lead-sync',
  name: 'Airtable Lead Sync',
  description: 'Automatically capture new WhatsApp leads and sync them to Airtable. Perfect for CRM lead capture workflows.',
  category: 'crm',
  plugins: ['airtable'],
  editorGraph: {
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { triggerType: 'message_received' }
      },
      {
        id: 'extract_1',
        type: 'action',
        position: { x: 300, y: 100 },
        data: {
          actionType: 'extract',
          fields: ['from', 'body', 'name', 'phone']
        }
      },
      {
        id: 'airtable_1',
        type: 'plugin',
        position: { x: 500, y: 100 },
        data: {
          pluginId: 'airtable',
          action: 'createRecord',
          baseId: '{{AIRTABLE_BASE_ID}}',
          tableId: '{{AIRTABLE_TABLE_ID}}',
          fields: {
            phone: '{{extract_1.phone}}',
            name: '{{extract_1.name}}',
            message: '{{extract_1.body}}',
            source: 'WhatsApp',
            capturedAt: '{{timestamp}}'
          }
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'trigger_1', target: 'extract_1' },
      { id: 'e2', source: 'extract_1', target: 'airtable_1' }
    ]
  },
  compiledDag: {
    entryNodeId: 'trigger_1',
    topologicalOrder: ['trigger_1', 'extract_1', 'airtable_1'],
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        next: ['extract_1'],
        input: { triggerType: 'message_received' }
      },
      {
        id: 'extract_1',
        type: 'action',
        next: ['airtable_1'],
        input: { actionType: 'extract', fields: ['from', 'body', 'name', 'phone'] }
      },
      {
        id: 'airtable_1',
        type: 'plugin',
        next: [],
        input: {
          pluginId: 'airtable',
          action: 'createRecord'
        }
      }
    ],
    metadata: {
      compiledAt: new Date().toISOString(),
      version: '1.0.0',
      nodeCount: 3
    }
  }
};

export const googleSheetsAutoResponderTemplate: WorkflowTemplate = {
  id: 'google-sheets-auto-responder',
  name: 'Google Sheets Auto-Responder',
  description: 'Lookup customer data in Google Sheets and send personalized auto-replies based on the retrieved information.',
  category: 'automation',
  plugins: ['google-sheets'],
  editorGraph: {
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { triggerType: 'message_received' }
      },
      {
        id: 'lookup_1',
        type: 'plugin',
        position: { x: 300, y: 100 },
        data: {
          pluginId: 'google-sheets',
          action: 'lookupRow',
          spreadsheetId: '{{SPREADSHEET_ID}}',
          sheetName: '{{SHEET_NAME}}',
          searchColumn: 0,
          searchValue: '{{phone}}'
        }
      },
      {
        id: 'condition_1',
        type: 'condition',
        position: { x: 500, y: 100 },
        data: {
          condition: '{{lookup_1}}',
          expression: 'exists'
        }
      },
      {
        id: 'reply_found_1',
        type: 'action',
        position: { x: 700, y: 50 },
        data: {
          actionType: 'send_message',
          message: 'Hello {{lookup_1.name}}! Thank you for reaching out. How can I help you today?'
        }
      },
      {
        id: 'reply_not_found_1',
        type: 'action',
        position: { x: 700, y: 200 },
        data: {
          actionType: 'send_message',
          message: 'Hello! Thank you for reaching out. We will get back to you shortly.'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'trigger_1', target: 'lookup_1' },
      { id: 'e2', source: 'lookup_1', target: 'condition_1' },
      { id: 'e3', source: 'condition_1', sourceHandle: 'true', target: 'reply_found_1' },
      { id: 'e4', source: 'condition_1', sourceHandle: 'false', target: 'reply_not_found_1' }
    ]
  },
  compiledDag: {
    entryNodeId: 'trigger_1',
    topologicalOrder: ['trigger_1', 'lookup_1', 'condition_1', 'reply_found_1', 'reply_not_found_1'],
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        next: ['lookup_1'],
        input: { triggerType: 'message_received' }
      },
      {
        id: 'lookup_1',
        type: 'plugin',
        next: ['condition_1'],
        input: {
          pluginId: 'google-sheets',
          action: 'lookupRow'
        }
      },
      {
        id: 'condition_1',
        type: 'condition',
        next: [],
        onTrue: 'reply_found_1',
        onFalse: 'reply_not_found_1',
        input: { condition: 'exists' }
      },
      {
        id: 'reply_found_1',
        type: 'action',
        next: [],
        input: { actionType: 'send_message' }
      },
      {
        id: 'reply_not_found_1',
        type: 'action',
        next: [],
        input: { actionType: 'send_message' }
      }
    ],
    metadata: {
      compiledAt: new Date().toISOString(),
      version: '1.0.0',
      nodeCount: 5
    }
  }
};

export const humanHandoffAlertTemplate: WorkflowTemplate = {
  id: 'human-handoff-alert',
  name: 'Human Handoff Alert',
  description: 'Detect when customers type "help" and automatically handoff the conversation to a human agent for personalized support.',
  category: 'support',
  plugins: [],
  editorGraph: {
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { triggerType: 'message_received' }
      },
      {
        id: 'condition_1',
        type: 'condition',
        position: { x: 300, y: 100 },
        data: {
          condition: 'message_body',
          expression: 'contains',
          value: 'help'
        }
      },
      {
        id: 'handoff_1',
        type: 'handoff',
        position: { x: 500, y: 100 },
        data: {
          priority: 'high',
          autoAssign: true
        }
      },
      {
        id: 'auto_reply_1',
        type: 'action',
        position: { x: 500, y: 250 },
        data: {
          actionType: 'send_message',
          message: 'I will connect you with a human agent right away. Please wait a moment.'
        }
      }
    ],
    edges: [
      { id: 'e1', source: 'trigger_1', target: 'condition_1' },
      { id: 'e2', source: 'condition_1', sourceHandle: 'true', target: 'handoff_1' },
      { id: 'e3', source: 'condition_1', sourceHandle: 'false', target: 'auto_reply_1' },
      { id: 'e4', source: 'handoff_1', target: 'auto_reply_1' }
    ]
  },
  compiledDag: {
    entryNodeId: 'trigger_1',
    topologicalOrder: ['trigger_1', 'condition_1', 'handoff_1', 'auto_reply_1'],
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        next: ['condition_1'],
        input: { triggerType: 'message_received' }
      },
      {
        id: 'condition_1',
        type: 'condition',
        next: [],
        onTrue: 'handoff_1',
        onFalse: 'auto_reply_1',
        input: { condition: 'message_body', expression: 'contains', value: 'help' }
      },
      {
        id: 'handoff_1',
        type: 'handoff',
        next: ['auto_reply_1'],
        input: { priority: 'high', autoAssign: true }
      },
      {
        id: 'auto_reply_1',
        type: 'action',
        next: [],
        input: { actionType: 'send_message', message: 'I will connect you with a human agent right away. Please wait a moment.' }
      }
    ],
    metadata: {
      compiledAt: new Date().toISOString(),
      version: '1.0.0',
      nodeCount: 4
    }
  }
};

export function getAllTemplates(): WorkflowTemplate[] {
  return [
    airtableLeadSyncTemplate,
    googleSheetsAutoResponderTemplate,
    humanHandoffAlertTemplate
  ];
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return getAllTemplates().find((template) => template.id === id);
}
