'use client';

import { useEffect, useCallback, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { dashboardApi } from '@/lib/api/dashboard-api';

const AGENCY_CONTEXT_KEY = 'nf_admin_agency_ctx';
const TENANT_CONTEXT_KEY = 'nf_admin_tenant_ctx';

interface UrlAgencyContextSetterProps {
  children: React.ReactNode;
}

function useUrlAgencyContext() {
  const searchParams = useSearchParams();
  const params = useParams();
  
  const [error, setError] = useState<{ type: 'agency' | 'tenant'; message: string } | null>(null);

  const validateAgency = useCallback(async (agencyId: string): Promise<boolean> => {
    try {
      await dashboardApi.getAgency(agencyId);
      return true;
    } catch {
      return false;
    }
  }, []);

  const validateTenant = useCallback(async (tenantId: string, agencyId: string): Promise<boolean> => {
    try {
      await dashboardApi.getAgencyTenant(agencyId, tenantId);
      return true;
    } catch {
      return false;
    }
  }, []);

  const setContextFromUrl = useCallback(async () => {
    const agencyIdFromQuery = searchParams.get('agencyId');
    const tenantIdFromQuery = searchParams.get('tenantId');

    const agencyIdFromRoute = params.agencyId as string | undefined;

    const targetAgencyId = agencyIdFromQuery || agencyIdFromRoute;
    const targetTenantId = tenantIdFromQuery;

    const currentAgencyId = localStorage.getItem(AGENCY_CONTEXT_KEY);
    const currentTenantId = localStorage.getItem(TENANT_CONTEXT_KEY);

    setError(null);

    if (targetAgencyId && targetAgencyId !== currentAgencyId) {
      const isValid = await validateAgency(targetAgencyId);
      if (!isValid) {
        setError({ type: 'agency', message: `Agency "${targetAgencyId}" not found` });
        return;
      }
      localStorage.setItem(AGENCY_CONTEXT_KEY, targetAgencyId);
      document.cookie = `nf_agency_context=${targetAgencyId}; path=/; max-age=2592000; sameSite=lax`;
    }

    if (targetTenantId && targetTenantId !== currentTenantId) {
      const agencyIdForTenant = targetAgencyId || currentAgencyId;
      if (!agencyIdForTenant) {
        setError({ type: 'tenant', message: 'No agency selected for tenant' });
        return;
      }
      const isValid = await validateTenant(targetTenantId, agencyIdForTenant);
      if (!isValid) {
        setError({ type: 'tenant', message: `Tenant "${targetTenantId}" not found` });
        return;
      }
      localStorage.setItem(TENANT_CONTEXT_KEY, targetTenantId);
      document.cookie = `nf_tenant_context=${targetTenantId}; path=/; max-age=2592000; sameSite=lax`;
    }
  }, [searchParams, params, validateAgency, validateTenant]);

  useEffect(() => {
    setContextFromUrl();
  }, [setContextFromUrl]);

  return error;
}

export function UrlAgencyContextSetter({ children }: UrlAgencyContextSetterProps) {
  const error = useUrlAgencyContext();
  
  if (error) {
    return (
      <>
        {children}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="max-w-md rounded-3xl border border-error/20 bg-surface-card p-8 shadow-xl animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
                <svg className="h-8 w-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-on-surface mb-2">
                {error.type === 'agency' ? 'Agency Not Found' : 'Tenant Not Found'}
              </h3>
              <p className="text-sm text-on-surface-muted mb-6">
                {error.message}
              </p>
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('agencyId');
                  url.searchParams.delete('tenantId');
                  window.location.href = url.pathname;
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}