import { Check, ShieldAlert, KeyRound, Save, Plus } from 'lucide-react';

export default function RoleManagementPage() {
  const resources = ['billing', 'conversations', 'workflows', 'team', 'roles'];
  const actions = ['create', 'read', 'update', 'delete', 'manage'];

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-10 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-primary-glow lumina-glow">
              <ShieldAlert className="h-5 w-5" />
            </div>
            Role & Permission Management
          </h1>
          <p className="text-[13px] font-medium text-on-surface-subtle mt-2 max-w-xl">
            Define custom roles and assign granular access control matrices across the platform. System roles cannot be modified.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-[13px] font-bold text-white shadow-primary-glow transition-transform hover:scale-105 active:scale-95">
          <Plus className="h-4 w-4" />
          Create Custom Role
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="glass-panel overflow-hidden rounded-3xl border border-border-ghost bg-surface-card p-5">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-on-surface-subtle/70 mb-5 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Role Library
            </h2>
            <div className="space-y-2">
              {['Platform Admin', 'Agency Owner', 'Agency Agent', 'Custom: Billing Specialist'].map((role, idx) => (
                <button
                  key={role}
                  className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-[13px] font-bold transition-all duration-300 ${
                    idx === 0
                      ? 'bg-primary/10 text-primary border border-primary/20 shadow-ambient'
                      : 'bg-surface-base text-on-surface-muted hover:bg-surface-card hover:text-on-surface border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 rounded-full ${idx < 3 ? 'bg-status-success shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-primary shadow-primary-glow'}`} />
                    {role}
                  </div>
                  {idx === 0 && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="glass-panel overflow-hidden rounded-3xl border border-border-ghost bg-surface-card">
            <div className="border-b border-border-ghost px-6 py-5 flex items-center justify-between bg-surface-base/30">
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-on-surface">Platform Admin</h2>
                <p className="text-[11px] font-semibold text-on-surface-subtle mt-0.5 uppercase tracking-widest">System Role • Read Only</p>
              </div>
              <button disabled className="inline-flex items-center gap-2 rounded-xl bg-surface-base px-4 py-2 text-[12px] font-bold text-on-surface-muted transition-all border border-border-ghost opacity-50 cursor-not-allowed">
                <Save className="h-3.5 w-3.5" />
                Save Changes
              </button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-left text-sm text-on-surface">
                  <thead>
                    <tr className="border-b border-border-ghost text-on-surface-subtle">
                      <th className="pb-4 font-black uppercase tracking-[0.2em] text-[10px] text-on-surface-subtle/70">Resource</th>
                      {actions.map((action) => (
                        <th key={action} className="pb-4 text-center font-black uppercase tracking-[0.2em] text-[10px] text-on-surface-subtle/70">{action}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-ghost/50">
                    {resources.map((resource) => (
                      <tr key={resource} className="group transition-colors hover:bg-surface-base/30">
                        <td className="py-4 font-semibold capitalize tracking-tight text-[13px]">{resource}</td>
                        {actions.map((action) => (
                          <td key={`${resource}-${action}`} className="py-4 text-center">
                            <label className="relative inline-flex cursor-not-allowed items-center justify-center">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                disabled
                                defaultChecked={true}
                              />
                              <div className="h-5 w-5 rounded-md border border-border-ghost bg-surface-base peer-checked:border-primary/50 peer-checked:bg-primary/20 transition-all flex items-center justify-center">
                                <Check className="h-3 w-3 text-primary opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                              </div>
                            </label>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
