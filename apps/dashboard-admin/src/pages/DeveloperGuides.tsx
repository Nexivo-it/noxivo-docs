import React, { useState } from 'react';
import { Book, Code, Server, Terminal, ChevronRight } from 'lucide-react';

const guides = [
  {
    id: 'architecture',
    title: 'Core Architecture',
    icon: <Server className="w-5 h-5" />,
    description: 'Overview of Fastify, BullMQ, and MongoDB integration.'
  },
  {
    id: 'contributing',
    title: 'Contributing Guide',
    icon: <Code className="w-5 h-5" />,
    description: 'Standards for adding routes, modules, and tests.'
  },
  {
    id: 'env',
    title: 'Environment Config',
    icon: <Terminal className="w-5 h-5" />,
    description: 'Required variables for local and production setups.'
  }
];

const DeveloperGuides: React.FC = () => {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2 mb-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Book className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-on-surface">Internal Developer Guides</h1>
        </div>
        <p className="text-on-surface-muted text-sm">Privileged technical documentation for Noxivo Engine developers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {guides.map((guide) => (
          <div 
            key={guide.id}
            className="bg-surface-section border border-border-ghost p-6 rounded-2xl flex flex-col justify-between group hover:border-primary/30 transition-all cursor-pointer glass"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-surface-base flex items-center justify-center mb-4 border border-border-ghost text-primary group-hover:scale-110 transition-transform">
                {guide.icon}
              </div>
              <h3 className="text-lg font-bold text-on-surface mb-2">{guide.title}</h3>
              <p className="text-sm text-on-surface-muted leading-relaxed mb-6">
                {guide.description}
              </p>
            </div>
            
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-border-ghost/50">
              <span className="text-xs font-mono text-on-surface-subtle uppercase tracking-wider">Internal Reference</span>
              <ChevronRight className="w-4 h-4 text-primary group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 p-8 bg-primary/5 border border-primary/10 rounded-3xl">
        <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary" />
          Quick Command Reference
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface-base p-4 rounded-xl border border-border-ghost font-mono text-sm">
            <p className="text-primary mb-1"># Start Engine Dev</p>
            <code className="text-on-surface-muted">pnpm --filter @noxivo/workflow-engine dev</code>
          </div>
          <div className="bg-surface-base p-4 rounded-xl border border-border-ghost font-mono text-sm">
            <p className="text-primary mb-1"># Update OpenAPI Spec</p>
            <code className="text-on-surface-muted">pnpm --filter @noxivo/workflow-engine gen-openapi</code>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeveloperGuides;
