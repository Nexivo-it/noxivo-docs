import React, { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Code2, Play, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

type ExplorerMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ExplorerEndpoint = {
  id: string;
  method: ExplorerMethod;
  pathTemplate: string;
  summary: string;
  operationId: string | null;
  parameters: {
    path: string[];
    query: string[];
  };
  hasRequestBody: boolean;
  responseStatusCodes: string[];
};

type ExplorerTag = {
  name: string;
  endpoints: ExplorerEndpoint[];
};

type ExplorerSpecResponse = {
  tags: ExplorerTag[];
  totalEndpoints: number;
  generatedAt: string;
};

type ExplorerResponseEnvelope = {
  origin: 'engine' | 'messaging_upstream';
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

function getMethodBadgeClasses(method: ExplorerMethod): string {
  switch (method) {
    case 'GET':
      return 'bg-primary/15 text-primary border-primary/30';
    case 'POST':
      return 'bg-secondary/15 text-secondary border-secondary/30';
    case 'PUT':
      return 'bg-warning/15 text-warning border-warning/30';
    case 'PATCH':
      return 'bg-indigo-400/15 text-indigo-300 border-indigo-400/30';
    case 'DELETE':
      return 'bg-error/15 text-error border-error/30';
    default:
      return 'bg-surface-base text-on-surface border-border-ghost';
  }
}

function extractPathParamNames(pathTemplate: string): string[] {
  const matches = pathTemplate.matchAll(/\{([^}]+)\}/g);
  return Array.from(matches, (match) => match[1]).filter((value): value is string => Boolean(value));
}

function stringifyPretty(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

const Explorer: React.FC = () => {
  const [spec, setSpec] = useState<ExplorerSpecResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTagName, setActiveTagName] = useState<string>('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ExplorerEndpoint | null>(null);
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryJson, setQueryJson] = useState('{}');
  const [bodyJson, setBodyJson] = useState('{}');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [responseEnvelope, setResponseEnvelope] = useState<ExplorerResponseEnvelope | null>(null);
  const [isSending, setIsSending] = useState(false);

  const activeTag = useMemo(
    () => spec?.tags.find((tag) => tag.name === activeTagName) ?? null,
    [activeTagName, spec]
  );

  const refreshSpec = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<ExplorerSpecResponse>('/messaging/spec');
      setSpec(response.data);

      const firstTag = response.data.tags[0];
      if (firstTag) {
        setActiveTagName((current) => (current.length > 0 ? current : firstTag.name));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load MessagingProvider explorer spec';
      setRequestError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSpec();
  }, []);

  useEffect(() => {
    if (!activeTag || activeTag.endpoints.length === 0) {
      setSelectedEndpoint(null);
      return;
    }

    setSelectedEndpoint((current) => {
      if (current && activeTag.endpoints.some((endpoint) => endpoint.id === current.id)) {
        return current;
      }
      return activeTag.endpoints[0] ?? null;
    });
  }, [activeTag]);

  useEffect(() => {
    if (!selectedEndpoint) {
      return;
    }

    const nextPathParams: Record<string, string> = {};
    for (const paramName of extractPathParamNames(selectedEndpoint.pathTemplate)) {
      nextPathParams[paramName] = '';
    }

    setPathParams(nextPathParams);
    setQueryJson('{}');
    setBodyJson('{}');
    setRequestError(null);
    setResponseEnvelope(null);
  }, [selectedEndpoint?.id]);

  const resolvedPath = useMemo(() => {
    if (!selectedEndpoint) {
      return '';
    }

    return selectedEndpoint.pathTemplate.replace(/\{([^}]+)\}/g, (_full, paramName: string) => {
      const raw = pathParams[paramName] ?? '';
      if (!raw.trim()) {
        return `{${paramName}}`;
      }
      return encodeURIComponent(raw.trim());
    });
  }, [pathParams, selectedEndpoint]);

  const sendRequest = async () => {
    if (!selectedEndpoint) {
      return;
    }

    setRequestError(null);
    setIsSending(true);

    try {
      if (resolvedPath.includes('{')) {
        throw new Error('Fill all required path parameters before sending');
      }

      let parsedQuery: Record<string, unknown> | undefined;
      if (queryJson.trim().length > 0) {
        const queryCandidate = JSON.parse(queryJson) as unknown;
        if (queryCandidate !== null && typeof queryCandidate === 'object' && !Array.isArray(queryCandidate)) {
          parsedQuery = queryCandidate as Record<string, unknown>;
        } else {
          throw new Error('Query must be a JSON object');
        }
      }

      let parsedBody: unknown = undefined;
      if (selectedEndpoint.method !== 'GET' && selectedEndpoint.method !== 'DELETE') {
        if (bodyJson.trim().length > 0) {
          parsedBody = JSON.parse(bodyJson);
        }
      }

      const response = await api.post<ExplorerResponseEnvelope>('/messaging/request', {
        method: selectedEndpoint.method,
        path: resolvedPath,
        ...(parsedQuery ? { query: parsedQuery } : {}),
        ...(parsedBody !== undefined ? { body: parsedBody } : {}),
      });

      setResponseEnvelope(response.data);
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data) {
        const envelope = error.response.data as ExplorerResponseEnvelope;
        setResponseEnvelope(envelope);
        setRequestError(null);
      } else {
        setRequestError(error instanceof Error ? error.message : 'Failed to send explorer request');
      }
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 text-on-surface-muted">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Loading MessagingProvider Explorer...
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MessagingProvider API Explorer</h1>
          <p className="text-on-surface-muted mt-1">
            Operate and test MessagingProvider endpoints by tag through the backend admin proxy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {spec && (
            <div className="text-right">
              <p className="text-[10px] text-on-surface-muted font-mono uppercase tracking-wider">Endpoints</p>
              <p className="text-lg font-bold tabular-nums">{spec.totalEndpoints}</p>
            </div>
          )}
          <button
            onClick={refreshSpec}
            className="p-2 bg-surface-section border border-border-ghost rounded-xl hover:text-primary transition-colors"
            title="Reload MessagingProvider spec"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {requestError && (
        <div className="bg-error/10 border border-error/20 text-error rounded-xl px-4 py-3 text-sm">
          {requestError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_1.2fr] gap-6">
        <section className="bg-surface-section border border-border-ghost rounded-2xl p-4 space-y-2 max-h-[70vh] overflow-y-auto">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-on-surface-muted px-2">Tags</h2>
          {(spec?.tags ?? []).map((tag) => (
            <button
              key={tag.name}
              onClick={() => setActiveTagName(tag.name)}
              className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                activeTagName === tag.name
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border-ghost text-on-surface-muted hover:text-on-surface hover:bg-surface-base'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{tag.name}</span>
                <span className="text-[10px] font-mono uppercase">{tag.endpoints.length}</span>
              </div>
            </button>
          ))}
        </section>

        <section className="bg-surface-section border border-border-ghost rounded-2xl p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-on-surface-muted px-2">
            {activeTag ? `${activeTag.name} Endpoints` : 'Endpoints'}
          </h2>
          {(activeTag?.endpoints ?? []).map((endpoint) => (
            <button
              key={endpoint.id}
              onClick={() => setSelectedEndpoint(endpoint)}
              className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${
                selectedEndpoint?.id === endpoint.id
                  ? 'border-primary/30 bg-primary/10'
                  : 'border-border-ghost hover:bg-surface-base'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 border rounded font-mono ${getMethodBadgeClasses(endpoint.method)}`}>
                  {endpoint.method}
                </span>
                <span className="font-mono text-xs text-on-surface">{endpoint.pathTemplate}</span>
              </div>
              <p className="text-xs text-on-surface-muted mt-1">{endpoint.summary || 'No summary available'}</p>
            </button>
          ))}
        </section>

        <section className="bg-surface-section border border-border-ghost rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Request Builder</h2>
            {selectedEndpoint && (
              <span className={`text-[10px] px-2 py-0.5 border rounded font-mono ${getMethodBadgeClasses(selectedEndpoint.method)}`}>
                {selectedEndpoint.method}
              </span>
            )}
          </div>

          {!selectedEndpoint ? (
            <p className="text-sm text-on-surface-muted">Select an endpoint to start.</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Resolved Path</p>
                <div className="px-3 py-2 rounded-lg bg-surface-base border border-border-ghost font-mono text-xs break-all">
                  {resolvedPath}
                </div>
              </div>

              {Object.keys(pathParams).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Path Params</p>
                  <div className="space-y-2">
                    {Object.keys(pathParams).map((param) => (
                      <input
                        key={param}
                        value={pathParams[param]}
                        onChange={(event) => setPathParams((current) => ({ ...current, [param]: event.target.value }))}
                        placeholder={param}
                        className="w-full bg-surface-base border border-border-ghost rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Query JSON Object</p>
                <textarea
                  value={queryJson}
                  onChange={(event) => setQueryJson(event.target.value)}
                  rows={4}
                  className="w-full bg-surface-base border border-border-ghost rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary"
                />
              </div>

              {selectedEndpoint.method !== 'GET' && selectedEndpoint.method !== 'DELETE' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Body JSON</p>
                  <textarea
                    value={bodyJson}
                    onChange={(event) => setBodyJson(event.target.value)}
                    rows={7}
                    className="w-full bg-surface-base border border-border-ghost rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <button
                onClick={sendRequest}
                disabled={isSending}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 transition-colors"
              >
                {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Send Request
              </button>

              <div className="pt-2 border-t border-border-ghost space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-primary" />
                    Response
                  </h3>
                  {responseEnvelope && (
                    <span className="text-xs font-mono text-on-surface-muted">
                      {responseEnvelope.origin} · {responseEnvelope.status}
                    </span>
                  )}
                </div>
                <pre className="bg-surface-base border border-border-ghost rounded-lg p-3 text-xs font-mono overflow-auto max-h-[280px]">
                  {responseEnvelope ? stringifyPretty(responseEnvelope) : 'No response yet'}
                </pre>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default Explorer;
