import Link from 'next/link';
import { Home, AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col items-center justify-center p-6 selection:bg-[#0C5CAB]/30">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#0C5CAB]/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-md w-full text-center">
        <div className="w-24 h-24 bg-[rgba(24,24,27,0.7)] backdrop-blur-xl border border-[rgba(39,39,42,0.6)] rounded-3xl mx-auto flex items-center justify-center shadow-2xl mb-8">
          <AlertTriangle className="w-10 h-10 text-[#0C5CAB]" strokeWidth={1.5} />
        </div>

        <h1 className="text-5xl font-bold tracking-tight mb-4">404</h1>
        <h2 className="text-xl font-semibold text-zinc-300 mb-4 tracking-wide">Route Not Found</h2>

        <p className="text-zinc-500 text-sm leading-relaxed mb-10 max-w-sm mx-auto">
          The page you are looking for has been moved, deleted, or does not exist. Please check the URL or return to the dashboard.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-3 px-8 py-4 bg-[#0C5CAB] hover:bg-[#0a4a8a] text-white text-[13px] font-bold uppercase tracking-[0.15em] rounded-2xl transition-all shadow-[0_4px_24px_-1px_rgba(12,92,171,0.4)] hover:shadow-[0_8px_32px_-4px_rgba(12,92,171,0.6)]"
        >
          <Home className="w-4 h-4" />
          Back to Safety
        </Link>
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold">Noxivo SaaS</p>
      </div>
    </div>
  );
}
