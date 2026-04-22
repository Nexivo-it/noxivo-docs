'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  Connection,
  Edge,
  Node,
  Panel,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MessageSquare, Zap, Split, Clock, UserPlus, Save, Database, List, Loader2, CheckCircle, Bug, Trash2 } from 'lucide-react';
import { compileGraphToDag } from '../../lib/workflows/graph-to-dag';
import { WorkflowExecutionEvent } from '@noxivo/contracts';
import { dashboardApi } from '../../lib/api/dashboard-api';
import { buildWorkflowEngineUrl } from '../../lib/api/workflow-engine-client';

// --- CUSTOM NODES (LUMINA STYLE) ---

interface NodeConfig {
  text?: string;
  variable?: string;
  operator?: string;
  value?: string;
  action?: string;
  tableName?: string;
  baseId?: string;
  spreadsheetId?: string;
  range?: string;
  delayMs?: number;
}

interface CustomNodeData {
  config?: NodeConfig;
  status?: 'hit' | 'completed' | 'failed';
  error?: string;
  output?: any;
  lastExecution?: {
    timestamp: string;
    duration?: number;
  };
  [key: string]: unknown;
}

type WorkflowDetailResponse = {
  workflow?: {
    editorGraph?: {
      nodes?: Node[];
      edges?: Edge[];
    };
  };
};

type CustomNodeProps = NodeProps<Node<CustomNodeData>>;

const NodeWrapper = ({ children, selected, title, icon: Icon, colorClass, status }: { children: React.ReactNode, selected?: boolean, title: string, icon: any, colorClass: string, status?: 'hit' | 'completed' | 'failed' | undefined }) => (
  <div className={`glass-panel rounded-2xl p-4 min-w-[200px] border-2 transition-all 
    ${selected ? 'border-primary shadow-primary-glow' : 'border-zinc-800'} 
    ${status === 'hit' ? 'border-yellow-400 shadow-yellow-glow animate-pulse' : ''}
    ${status === 'completed' ? 'border-emerald-500 shadow-emerald-glow' : ''}
    ${status === 'failed' ? 'border-rose-500 shadow-rose-glow' : ''}
    hover:border-primary/50 bg-zinc-900/80 backdrop-blur-xl`}>
    <div className="flex items-center gap-3 mb-3 border-b border-white/5 pb-3">
      <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10 text-white`}>
        <Icon className={`size-4 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-100">{title}</span>
    </div>
    <div className="space-y-2">
      {children}
    </div>
  </div>
);

const WhatsAppTriggerNode = ({ selected, data }: CustomNodeProps) => (
  <NodeWrapper title="WhatsApp Trigger" icon={Zap} colorClass="bg-primary" selected={selected} status={data.status}>
    <p className="text-[10px] text-zinc-400 leading-relaxed">Activates when a new message is received from a contact.</p>
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-primary border-2 border-zinc-900" />
  </NodeWrapper>
);

const SendMessageNode = ({ data, selected }: CustomNodeProps) => (
  <NodeWrapper title="Send Message" icon={MessageSquare} colorClass="bg-emerald-500" selected={selected} status={data.status}>
    <div className="bg-black/20 rounded-lg p-2 border border-white/5">
      <p className="text-[10px] text-zinc-300 line-clamp-2 italic opacity-80">
        {String(data.config?.text || 'Type message in config...')}
      </p>
    </div>
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-zinc-500 border-2 border-zinc-900" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-emerald-500 border-2 border-zinc-900" />
  </NodeWrapper>
);

const ConditionNode = ({ data, selected }: CustomNodeProps) => (
  <NodeWrapper title="Condition" icon={Split} colorClass="bg-amber-500" selected={selected} status={data.status}>
    <div className="bg-black/20 rounded-lg p-2 border border-white/5">
      <p className="text-[9px] font-mono text-amber-500 uppercase tracking-tighter">
        {data.config?.variable || 'var'} {data.config?.operator || '=='} {data.config?.value || 'val'}
      </p>
    </div>
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-zinc-500 border-2 border-zinc-900" />
    <div className="flex justify-between mt-2 pt-2 border-t border-white/5">
      <div className="relative">
        <Handle type="source" position={Position.Bottom} id="true" className="w-3 h-3 bg-emerald-500 border-2 border-zinc-900 left-[-20px]" />
        <span className="text-[9px] font-bold text-emerald-500 ml-[-15px]">TRUE</span>
      </div>
      <div className="relative">
        <Handle type="source" position={Position.Bottom} id="false" className="w-3 h-3 bg-rose-500 border-2 border-zinc-900 right-[-20px]" />
        <span className="text-[9px] font-bold text-rose-500 mr-[-15px]">FALSE</span>
      </div>
    </div>
  </NodeWrapper>
);

const AirtableNode = ({ data, selected }: CustomNodeProps) => (
  <NodeWrapper title="Airtable" icon={Database} colorClass="bg-blue-500" selected={selected} status={data.status}>
    <div className="bg-black/20 rounded-lg p-2 border border-white/5">
      <p className="text-[9px] text-zinc-400 font-bold uppercase truncate">{data.config?.action || 'NO_ACTION'}</p>
      <p className="text-[10px] text-white truncate opacity-80">{data.config?.tableName || 'Select table...'}</p>
    </div>
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-zinc-500 border-2 border-zinc-900" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500 border-2 border-zinc-900" />
  </NodeWrapper>
);

const GoogleSheetsNode = ({ data, selected }: CustomNodeProps) => (
  <NodeWrapper title="Google Sheets" icon={List} colorClass="bg-green-600" selected={selected} status={data.status}>
    <div className="bg-black/20 rounded-lg p-2 border border-white/5">
      <p className="text-[9px] text-zinc-400 font-bold uppercase truncate">{data.config?.action || 'NO_ACTION'}</p>
      <p className="text-[10px] text-white truncate opacity-80">{data.config?.range || 'Select range...'}</p>
    </div>
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-zinc-500 border-2 border-zinc-900" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-green-600 border-2 border-zinc-900" />
  </NodeWrapper>
);

const HandoffNode = ({ selected, data }: CustomNodeProps) => (
  <NodeWrapper title="Human Handoff" icon={UserPlus} colorClass="bg-violet-500" selected={selected} status={data.status}>
    <p className="text-[10px] text-zinc-400 leading-relaxed">Pause automation and alert operator.</p>
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-zinc-500 border-2 border-zinc-900" />
  </NodeWrapper>
);

const DelayNode = ({ data, selected }: CustomNodeProps) => (
  <NodeWrapper title="Delay" icon={Clock} colorClass="bg-zinc-500" selected={selected} status={data.status}>
    <div className="bg-black/20 rounded-lg p-2 border border-white/5 text-center">
      <p className="text-[10px] font-black text-on-surface tracking-widest">
        {data.config?.delayMs ? `${(data.config.delayMs / 1000 / 60).toFixed(1)} MIN` : 'Set delay...'}
      </p>
    </div>
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-zinc-500 border-2 border-zinc-900" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-zinc-500 border-2 border-zinc-900" />
  </NodeWrapper>
);

const nodeTypes = {
  trigger: WhatsAppTriggerNode,
  action: SendMessageNode,
  condition: ConditionNode,
  airtable: AirtableNode,
  google_sheets: GoogleSheetsNode,
  handoff: HandoffNode,
  delay: DelayNode,
};

// --- MAIN BUILDER COMPONENT ---

export function VisualBuilder({ 
  workflowId,
  initialNodes: propNodes,
  initialEdges: propEdges,
  onSave
}: { 
  workflowId?: string,
  initialNodes?: any[],
  initialEdges?: any[],
  onSave?: (nodes: any[], edges: any[]) => Promise<void>
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(propNodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(propEdges || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [debugEvents, setDebugEvents] = useState<WorkflowExecutionEvent[]>([]);

  React.useEffect(() => {
    if (!isDebugMode) {
      setDebugEvents([]);
      setNodes((nds) => nds.map(n => ({ ...n, data: { ...n.data, status: undefined, error: undefined } })));
      return;
    }

    const eventSource = new EventSource(
      buildWorkflowEngineUrl(`/api/v1/workflows/${workflowId}/execution-events`),
      { withCredentials: true }
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        const executionEvent = data as WorkflowExecutionEvent;
        
        // Deduplication & Full Record Storage
        setDebugEvents((prev) => {
          // If we already have a 'completed' or 'failed' event for this node in the current session, 
          // don't let an older 'hit' event (from hydration) overwrite it visually, 
          // but do keep the event in the stream log.
          const isNewer = !prev.some(p => p.nodeId === executionEvent.nodeId && (p.status === 'completed' || p.status === 'failed') && executionEvent.status === 'hit');
          
          return [executionEvent, ...prev].slice(0, 100);
        });

        setNodes((nds) => nds.map(node => {
          if (node.id === executionEvent.nodeId) {
            // Only update status if it's an upgrade (hit -> completed/failed) or if it's the first event
            const currentStatus = node.data.status;
            const shouldUpdateStatus = !currentStatus || 
              (currentStatus === 'hit' && (executionEvent.status === 'completed' || executionEvent.status === 'failed')) ||
              (executionEvent.status !== 'hit');

            return {
              ...node,
              data: {
                ...node.data,
                status: shouldUpdateStatus ? executionEvent.status : currentStatus,
                error: executionEvent.error || node.data.error,
                output: executionEvent.output || node.data.output,
                lastExecution: {
                  timestamp: executionEvent.timestamp,
                  // We could calculate duration if we had the 'hit' event's timestamp, 
                  // but for now simple timestamp is good.
                }
              }
            };
          }
          return node;
        }));
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [isDebugMode, workflowId, setNodes]);

  React.useEffect(() => {
    if (propNodes && propNodes.length > 0) {
      setIsLoading(false);
      return;
    }
    if (!workflowId) {
      setIsLoading(false);
      return;
    }
    async function loadWorkflow() {
      try {
        const data = await dashboardApi.getWorkflowDetail<WorkflowDetailResponse>(workflowId);
        
        if (data.workflow?.editorGraph) {
          const { nodes: graphNodes, edges: graphEdges } = data.workflow.editorGraph;
          setNodes(graphNodes || []);
          setEdges(graphEdges || []);
        } else {
          setNodes([{
            id: 'node-start',
            type: 'trigger',
            position: { x: 250, y: 50 },
            data: { config: {} },
          }]);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Failed to load workflow definition.');
      } finally {
        setIsLoading(false);
      }
    }
    loadWorkflow();
  }, [workflowId, propNodes, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) as any, [nodes, selectedNodeId]);

  const addNode = (type: string) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type: type as any,
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: { config: {} },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const updateNodeConfig = (id: string, config: any) => {
    setNodes((nds) => nds.map(n => n.id === id ? { ...n, data: { ...n.data, config: { ...(n.data.config as any), ...config } } } : n));
  };

  const handleSave = async () => {
    if (onSave) {
      setIsSaving(true);
      setError(null);
      try {
        await onSave(nodes, edges);
        setLastSaved(new Date());
      } catch (err: any) {
        setError(err.message || 'Error saving workflow.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!workflowId) return;

    setIsSaving(true);
    setError(null);
    try {
      const graph = { nodes, edges };
      const compiledDag = compileGraphToDag(graph);

      await dashboardApi.saveWorkflowDefinition(workflowId, {
        editorGraph: graph,
        compiledDag,
      });
      
      setLastSaved(new Date());
    } catch (err: any) {
      setError(err.message || 'Error compiling or saving workflow.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 rounded-3xl border border-white/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Initializing Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-zinc-950 rounded-[2.5rem] border border-white/5 shadow-2xl">
      <aside className="w-64 border-r border-white/5 bg-zinc-900/50 p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-2 rounded-full bg-emerald-500 pulse-glow" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Live Editor</span>
        </div>

        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-2">Triggers & Actions</h4>
        <button onClick={() => addNode('trigger')} className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-all text-left group">
          <div className="p-2 bg-primary/20 rounded-lg text-primary group-hover:scale-110 transition-transform"><Zap size={16} /></div>
          <span className="text-xs font-bold text-zinc-300">New Message</span>
        </button>
        <button onClick={() => addNode('action')} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-all text-left group">
          <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500 group-hover:scale-110 transition-transform"><MessageSquare size={16} /></div>
          <span className="text-xs font-bold text-zinc-300">Reply</span>
        </button>
        <button onClick={() => addNode('condition')} className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all text-left group">
          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500 group-hover:scale-110 transition-transform"><Split size={16} /></div>
          <span className="text-xs font-bold text-zinc-300">Logic Jump</span>
        </button>
        <button onClick={() => addNode('delay')} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-600/5 border border-white/5 hover:bg-zinc-600/10 transition-all text-left group">
          <div className="p-2 bg-zinc-600/20 rounded-lg text-zinc-400 group-hover:scale-110 transition-transform"><Clock size={16} /></div>
          <span className="text-xs font-bold text-zinc-300">Delay</span>
        </button>

        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-6 mb-2">Cloud Storage</h4>
        <button onClick={() => addNode('airtable')} className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-all text-left group">
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-500 group-hover:scale-110 transition-transform"><Database size={16} /></div>
          <span className="text-xs font-bold text-zinc-300">Airtable</span>
        </button>
        <button onClick={() => addNode('google_sheets')} className="flex items-center gap-3 p-3 rounded-xl bg-green-600/5 border border-green-600/10 hover:bg-green-600/10 transition-all text-left group">
          <div className="p-2 bg-green-600/20 rounded-lg text-green-500 group-hover:scale-110 transition-transform"><List size={16} /></div>
          <span className="text-xs font-bold text-zinc-300">Sheets</span>
        </button>
        <button onClick={() => addNode('handoff')} className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/10 hover:bg-violet-500/10 transition-all text-left group">
          <div className="p-2 bg-violet-500/20 rounded-lg text-violet-400 group-hover:scale-110 transition-transform"><UserPlus size={16} /></div>
          <span className="text-xs font-bold text-zinc-300">Operator</span>
        </button>

        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-6 mb-2">Automation Intelligence</h4>
        <button 
          onClick={() => setIsDebugMode(!isDebugMode)} 
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left group w-full ${isDebugMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-800/20 border-white/5 hover:bg-white/5'}`}
        >
          <div className={`p-2 rounded-lg ${isDebugMode ? 'bg-amber-500/20 text-amber-500' : 'bg-zinc-800 text-zinc-500'} group-hover:scale-110 transition-transform`}>
            <Bug size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-zinc-300">Debug Mode</span>
            <span className="text-[8px] text-zinc-600 font-black uppercase tracking-tighter">{isDebugMode ? 'Listening...' : 'Offline'}</span>
          </div>
        </button>

        {isDebugMode && (
          <div className="mt-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-2 px-1">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Event Stream</h4>
              <button onClick={() => setDebugEvents([])} className="text-zinc-700 hover:text-zinc-500 transition-colors"><Trash2 size={10} /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-hide">
              {debugEvents.length === 0 && <p className="text-[9px] text-zinc-700 italic px-1">Waiting for hits...</p>}
              {debugEvents.map((ev, i) => (
                <div key={i} className="bg-black/40 border border-white/5 rounded-lg p-2 animate-in fade-in slide-in-from-left duration-300">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] font-mono text-zinc-500">{ev.nodeId.split('-')[0]}</span>
                    <span className={`text-[7px] font-black uppercase tracking-tighter ${ev.status === 'hit' ? 'text-yellow-500' : ev.status === 'completed' ? 'text-emerald-500' : 'text-rose-500'}`}>{ev.status}</span>
                  </div>
                  <p className="text-[8px] text-zinc-400 font-mono truncate">{new Date(ev.timestamp).toLocaleTimeString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-3 pt-6 border-t border-white/5">
          {error && <p className="text-[10px] text-rose-500 font-bold mb-2 animate-pulse">⚠️ {error}</p>}
          {lastSaved && !isSaving && (
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={10} className="text-emerald-500" />
              <span className="text-[9px] text-emerald-500/60 font-medium">Saved {lastSaved.toLocaleTimeString()}</span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 bg-primary hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-2xl text-[10px] tracking-[0.2em] uppercase transition-all shadow-primary-glow flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save size={14} />}
            Deploy & Compile
          </button>
        </div>
      </aside>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background color="#1e1e2e" gap={24} size={1} />
          <Controls />
          <Panel position="top-right">
            <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Lumina Flux v4.2
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <aside className="w-80 border-l border-white/5 bg-zinc-900/50 p-8 overflow-y-auto custom-scroll animate-in slide-in-from-right duration-300 scrollbar-hide">
          <div className="flex justify-between items-center mb-8">
            <div className="flex flex-col">
              <h4 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] text-zinc-100">Configuration</h4>
              <p className="text-[9px] text-zinc-600 font-mono mt-1">{selectedNode.id}</p>
            </div>
            <button onClick={() => setSelectedNodeId(null)} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-zinc-500">&times;</button>
          </div>

          <div className="space-y-8">
            {selectedNode.type === 'action' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Message Content</label>
                  <textarea
                    value={selectedNode.data.config?.text || ''}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { text: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-4 text-xs min-h-[160px] focus:border-primary outline-none transition-all text-zinc-200 placeholder:text-zinc-700"
                    placeholder="Hello! How can we help you today?"
                  />
                  <p className="text-[9px] text-zinc-600 italic">Use {"{{name}}"} for dynamic personalization.</p>
                </div>
              </div>
            )}

            {selectedNode.type === 'condition' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Variable Path</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.variable || 'message.body'}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { variable: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all text-zinc-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Operator</label>
                  <select
                    value={selectedNode.data.config?.operator || 'includes'}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { operator: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all appearance-none text-zinc-200 cursor-pointer hover:bg-zinc-900"
                  >
                    <option value="includes">Contains string</option>
                    <option value="equals">Exactly equals</option>
                    <option value="regex">Regex test</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Match Value</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.value || ''}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { value: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all text-zinc-200"
                    placeholder="e.g. support, help"
                  />
                </div>
              </div>
            )}

            {selectedNode.type === 'delay' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Delay (Minutes)</label>
                  <input
                    type="number"
                    value={selectedNode.data.config?.delayMs ? selectedNode.data.config.delayMs / 1000 / 60 : ''}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { delayMs: Number(e.target.value) * 60 * 1000 })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all text-zinc-200"
                    placeholder="5"
                    min="1"
                  />
                </div>
              </div>
            )}

            {selectedNode.type === 'airtable' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Base ID</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.baseId || ''}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { baseId: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all font-mono text-zinc-200"
                    placeholder="appXXXXX..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Table Name</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.tableName || ''}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { tableName: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all text-zinc-200"
                    placeholder="Leads"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Action</label>
                  <select
                    value={selectedNode.data.config?.action || 'create'}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { action: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all appearance-none text-zinc-200 cursor-pointer hover:bg-zinc-900"
                  >
                    <option value="create">Create Record</option>
                    <option value="update">Update Record</option>
                    <option value="search">Search Records</option>
                  </select>
                </div>
              </div>
            )}

            {selectedNode.type === 'google_sheets' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Spreadsheet ID</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.spreadsheetId || ''}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { spreadsheetId: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all font-mono text-zinc-200"
                    placeholder="1BxiMvsC..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Range / Sheet</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.range || 'Sheet1!A:Z'}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { range: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all text-zinc-200"
                    placeholder="Sheet1!A:Z"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Action</label>
                  <select
                    value={selectedNode.data.config?.action || 'append'}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { action: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/5 rounded-xl p-3 text-xs focus:border-primary outline-none transition-all appearance-none text-zinc-200 cursor-pointer hover:bg-zinc-900"
                  >
                    <option value="append">Append Row</option>
                    <option value="update">Update Cell</option>
                  </select>
                </div>
              </div>
            )}

            {isDebugMode && (
              <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bug size={12} className="text-amber-500" />
                  <p className="text-[10px] text-zinc-500 font-bold uppercase">Execution Trace</p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg">
                    <span className="text-[9px] font-mono text-zinc-600">STATUS</span>
                    <span className={`text-[9px] font-black uppercase ${selectedNode.data.status === 'failed' ? 'text-rose-500' : selectedNode.data.status === 'completed' ? 'text-emerald-500' : selectedNode.data.status === 'hit' ? 'text-yellow-500' : 'text-zinc-600'}`}>
                      {selectedNode.data.status || 'Idle'}
                    </span>
                  </div>

                  {selectedNode.data.lastExecution && (
                    <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg">
                      <span className="text-[9px] font-mono text-zinc-600">LAST HIT</span>
                      <span className="text-[9px] text-zinc-400 font-mono">
                        {new Date(selectedNode.data.lastExecution.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )}

                  {(selectedNode.data.output || selectedNode.data.error) && (
                    <div className="pt-2">
                      <span className="text-[8px] font-black text-zinc-600 uppercase block mb-2">Result Payload</span>
                      <div className="bg-zinc-950 rounded-xl p-3 border border-white/5 max-h-48 overflow-auto custom-scroll">
                        <pre className="text-[9px] font-mono text-zinc-400 leading-relaxed overflow-x-hidden whitespace-pre-wrap">
                          {JSON.stringify(selectedNode.data.output || { error: selectedNode.data.error }, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

export default VisualBuilder;
