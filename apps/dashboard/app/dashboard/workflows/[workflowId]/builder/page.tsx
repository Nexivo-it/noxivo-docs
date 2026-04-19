'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { 
  ReactFlow,
  addEdge, 
  Background, 
  Controls, 
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type SelectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Zap, 
  ArrowLeft, 
  Play, 
  Plus, 
  Settings2, 
  Layout, 
  Activity,
  Workflow,
  Sparkles,
  Database,
  Table,
  Clock,
  UserCheck,
  Code
} from 'lucide-react';
import Link from 'next/link';

// Custom Nodes Components
const CustomNodeWrapper = ({ children, title, icon: Icon, color, selected, data }: any) => (
  <div className={`group relative min-w-[200px] bg-[#0A0A0A] border ${selected ? 'border-[#818CF8] shadow-[0_0_20px_rgba(129,140,248,0.2)]' : 'border-white/10'} ${data?.isActive ? 'ring-2 ring-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]' : ''} rounded-xl transition-all duration-300 overflow-hidden`}>
    <div className={`h-1.5 w-full ${color}`}></div>
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg bg-white/5 ${color.replace('bg-', 'text-')}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">{title}</span>
        {data?.isActive && (
          <span className="ml-auto flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
        )}
      </div>
      {children}
    </div>
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none"></div>
  </div>
);

const WhatsAppTriggerNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Trigger" icon={Zap} color="bg-emerald-500" selected={selected} data={data}>
    <p className="text-[10px] text-white/40 mb-1">When message contains</p>
    <div className="text-xs font-medium text-white/80 bg-white/5 p-2 rounded-lg border border-white/5">
      {data.pattern || 'Any Message'}
    </div>
  </CustomNodeWrapper>
);

const ConditionNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Condition" icon={Activity} color="bg-amber-500" selected={selected} data={data}>
    <div className="space-y-1">
      <p className="text-[10px] text-white/40">Check if {data.variable || 'field'}</p>
      <div className="text-[11px] font-medium text-white/70">
        {data.operator || 'equals'} {data.value || '...'}
      </div>
    </div>
  </CustomNodeWrapper>
);

const ActionNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Send Message" icon={Sparkles} color="bg-blue-500" selected={selected} data={data}>
    <p className="text-[10px] text-white/40 mb-1">WhatsApp Response</p>
    <div className="text-xs text-white/70 line-clamp-2 italic">
      "{data.text || 'Type your message...'}"
    </div>
  </CustomNodeWrapper>
);

const PluginNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="AI Action" icon={Code} color="bg-violet-500" selected={selected} data={data}>
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/60">
        {data.pluginId || 'Select Plugin'}
      </span>
    </div>
  </CustomNodeWrapper>
);

const AirtableNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Airtable" icon={Table} color="bg-[#FF4F81]" selected={selected} data={data}>
    <p className="text-[10px] text-white/40 mb-1">{data.action || 'Create Record'}</p>
    <div className="text-xs text-white/60 truncate">{data.table || 'Select Table'}</div>
  </CustomNodeWrapper>
);

const GoogleSheetsNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Sheets" icon={Database} color="bg-[#0F9D58]" selected={selected} data={data}>
    <p className="text-[10px] text-white/40 mb-1">{data.action || 'Add Row'}</p>
    <div className="text-xs text-white/60 truncate">{data.sheetName || 'Select Sheet'}</div>
  </CustomNodeWrapper>
);

const DelayNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Wait" icon={Clock} color="bg-indigo-500" selected={selected} data={data}>
    <div className="text-xs font-medium text-white/70">
      Wait for {data.delayMs ? `${data.delayMs / 1000}s` : '5s'}
    </div>
  </CustomNodeWrapper>
);

const HandoffNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Handoff" icon={UserCheck} color="bg-rose-500" selected={selected} data={data}>
    <p className="text-xs text-white/60 italic">Escalate to human agent</p>
  </CustomNodeWrapper>
);

const WebhookNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="Webhook" icon={Code} color="bg-orange-500" selected={selected} data={data}>
    <p className="text-[10px] text-white/40 mb-1">{data.method || 'POST'}</p>
    <div className="text-xs text-white/60 truncate">{data.url || 'https://api.example.com'}</div>
  </CustomNodeWrapper>
);

const CRMNode = ({ data, selected }: any) => (
  <CustomNodeWrapper title="CRM" icon={UserCheck} color="bg-cyan-500" selected={selected} data={data}>
    <p className="text-[10px] text-white/40 mb-1">{data.action || 'Sync Contact'}</p>
    <div className="text-xs text-white/60 truncate">{data.provider || 'HubSpot'}</div>
  </CustomNodeWrapper>
);

const nodeTypes = {
  trigger: WhatsAppTriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  plugin: PluginNode,
  delay: DelayNode,
  handoff: HandoffNode,
  airtable: AirtableNode,
  google_sheets: GoogleSheetsNode,
  webhook: WebhookNode,
  crm: CRMNode
};

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'trigger',
    position: { x: 100, y: 100 },
    data: { pattern: 'Keyword match' },
  },
  {
    id: '2',
    type: 'condition',
    position: { x: 400, y: 100 },
    data: { variable: 'intent', operator: 'equals', value: 'billing' },
  },
  {
    id: '3',
    type: 'action',
    position: { x: 700, y: 20 },
    data: { text: "I'll help you with your billing inquiry!" },
  },
  {
    id: '4',
    type: 'handoff',
    position: { x: 700, y: 180 },
    data: {},
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', sourceHandle: 'true', label: 'Match' },
  { id: 'e2-4', source: '2', target: '4', sourceHandle: 'false', label: 'Other' },
];

export default function WorkflowBuilderPage({ params: paramsPromise }: { params: Promise<{ workflowId: string }> }) {
  const ReactParams = React.use(paramsPromise);
  const workflowId = ReactParams.workflowId;
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [activeNodeIds, setActiveNodeIds] = useState<Set<string>>(new Set());

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  // Polling for live debug data
  React.useEffect(() => {
    if (!isDebugMode) {
      setActiveNodeIds(new Set());
      setEdges((eds) => eds.map(e => ({ ...e, animated: false })));
      return;
    }

    const fetchLiveStats = async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}/runs`);
        if (!res.ok) return;
        const data = await res.json();
        
        const newActiveNodes = new Set<string>();
        const activeRunIds = data.runs.filter((r: any) => r.status === 'running').map((r: any) => r.workflowRunId);
        
        data.events.forEach((event: any) => {
          if (activeRunIds.includes(event.workflowRunId)) {
            newActiveNodes.add(event.nodeId);
          }
        });

        setActiveNodeIds(newActiveNodes);

        setEdges((eds) => eds.map(edge => {
          const isEdgeActive = newActiveNodes.has(edge.source) && newActiveNodes.has(edge.target);
          return {
            ...edge,
            animated: isEdgeActive,
            style: (isEdgeActive ? { stroke: '#818CF8', strokeWidth: 3 } : {}) as React.CSSProperties
          };
        }));

        setNodes((nds) => nds.map(node => {
          return {
            ...node,
            data: {
              ...node.data,
              isActive: newActiveNodes.has(node.id)
            }
          };
        }));

      } catch (err) {
        console.error('Debug poll error:', err);
      }
    };

    const interval = setInterval(fetchLiveStats, 3000);
    fetchLiveStats();
    return () => clearInterval(interval);
  }, [isDebugMode, workflowId]);

  const addNode = (type: string) => {
    const newNode: Node = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: `${type} node` },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const compileDag = () => {
    // Basic topological sort/compilation logic
    const compiledNodes = nodes.map(node => {
      const nodeEdges = edges.filter(e => e.source === node.id);
      
      const compiledNode: any = {
        id: node.id,
        type: node.type,
        input: node.data,
        next: nodeEdges.filter(e => !e.sourceHandle || (e.sourceHandle !== 'true' && e.sourceHandle !== 'false')).map(e => e.target),
      };

      if (node.type === 'condition') {
        const trueEdge = nodeEdges.find(e => e.sourceHandle === 'true');
        const falseEdge = nodeEdges.find(e => e.sourceHandle === 'false');
        if (trueEdge) compiledNode.onTrue = trueEdge.target;
        if (falseEdge) compiledNode.onFalse = falseEdge.target;
      }

      return compiledNode;
    });

    const entryNode = nodes.find(n => n.type === 'trigger')?.id || nodes[0]?.id || '';
    
    const dag = {
      nodes: compiledNodes,
      entryNodeId: entryNode,
      topologicalOrder: compiledNodes.map(n => n.id) // Simplified
    };

    return {
      editorGraph: { nodes, edges },
      compiledDag: dag
    };
  };

  const onSave = async () => {
    try {
      const { editorGraph, compiledDag } = compileDag();
      
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          editorGraph,
          compiledDag,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save workflow');
      }

      alert('Workflow saved successfully!');
    } catch (error) {
      console.error('Error saving workflow:', error);
      alert('Failed to save workflow. See console for details.');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a] bg-[#0A0A0A]/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-4">
          <Link 
            href={`/dashboard/workflows/${workflowId}`}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Workflow Builder</h1>
            <p className="text-xs text-white/40">Visual flow editor • LUMINA-017 Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all flex items-center gap-2 ${isDebugMode ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
          >
            <Activity className={`w-4 h-4 ${isDebugMode ? 'animate-pulse' : ''}`} />
            {isDebugMode ? 'Live Debugging: ON' : 'Live Debugging: OFF'}
          </button>
          <button 
            onClick={onSave}
            className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-white/90 transition-all active:scale-95 flex items-center gap-2"
          >
            <Zap className="w-4 h-4 fill-current" />
            Save & Publish
          </button>
        </div>
      </header>

      {/* Main Flow Editor */}
      <div className="flex-1 relative z-10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          selectionMode={'button' as SelectionMode}
          className="bg-dot-white/[0.05]"
        >
          <Background color="#fff" gap={20} size={1} />
          <Controls className="!bg-[#0A0A0A] !border-white/10 !fill-white" />
          <MiniMap 
            nodeColor={(n) => {
              if (n.type === 'trigger') return '#10b981';
              if (n.type === 'action') return '#3b82f6';
              if (n.type === 'condition') return '#f59e0b';
              return '#1a1a1a';
            }}
            maskColor="rgba(0, 0, 0, 0.7)"
            className="!bg-[#0A0A0A] !border-white/10"
          />
        </ReactFlow>

        {/* Sidebar / Node Palette */}
        <aside className="absolute left-6 top-6 bottom-6 w-16 flex flex-col items-center py-6 gap-6 bg-[#0A0A0A]/80 border border-white/10 rounded-2xl backdrop-blur-xl z-20 overflow-y-auto">
          <button 
            onClick={() => addNode('trigger')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-emerald-500 hover:scale-110 transition-transform shadow-lg shadow-emerald-500/10"
            title="Add Trigger"
          >
            <Zap className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('condition')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-amber-500 hover:scale-110 transition-transform"
            title="Add Condition"
          >
            <Activity className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('action')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-blue-500 hover:scale-110 transition-transform"
            title="Add Send Message"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('airtable')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-[#FF4F81] hover:scale-110 transition-transform"
            title="Add Airtable"
          >
            <Table className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('google_sheets')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-[#0F9D58] hover:scale-110 transition-transform"
            title="Add Google Sheets"
          >
            <Database className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('webhook')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-orange-500 hover:scale-110 transition-transform"
            title="Add Webhook"
          >
            <Code className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('crm')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-cyan-500 hover:scale-110 transition-transform"
            title="Add CRM"
          >
            <UserCheck className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('delay')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-indigo-500 hover:scale-110 transition-transform"
            title="Add Delay"
          >
            <Clock className="w-5 h-5" />
          </button>
          <button 
            onClick={() => addNode('handoff')}
            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-rose-500 hover:scale-110 transition-transform"
            title="Add Handoff"
          >
            <UserCheck className="w-5 h-5" />
          </button>
          <div className="flex-1 w-full flex flex-col items-center justify-end gap-6 pb-2">
             <button className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-white/40 hover:text-white transition-colors">
              <Settings2 className="w-5 h-5" />
            </button>
          </div>
        </aside>
      </div>

      <style jsx global>{`
        .react-flow__edge-path {
          stroke: rgba(255, 255, 255, 0.15);
          stroke-width: 2;
        }
        .react-flow__edge.animated .react-flow__edge-path {
          stroke: #818CF8;
          stroke-dasharray: 5;
        }
        .react-flow__node {
          cursor: pointer;
        }
        .react-flow__handle {
          width: 8px;
          height: 8px;
          background: #818CF8;
          border: 2px solid #050505;
        }
        .bg-dot-white {
          background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}
