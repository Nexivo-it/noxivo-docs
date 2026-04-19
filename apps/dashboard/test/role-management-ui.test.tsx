import React, { createElement } from 'react';
import * as ReactNamespace from 'react';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RoleManagementPage from '../app/dashboard/admin/roles/page';

describe('Role Management UI', () => {
  beforeAll(() => {
    vi.stubGlobal('React', ReactNamespace);
  });

  it('renders the role management matrix table', () => {
    const markup = renderToStaticMarkup(createElement(RoleManagementPage));

    expect(markup).toContain('Role &amp; Permission Management');
    expect(markup).toContain('Create Custom Role');
    expect(markup).toContain('Role Library');
    
    // Check for matrix resources
    expect(markup).toContain('billing');
    expect(markup).toContain('conversations');
    expect(markup).toContain('workflows');
    
    // Check for matrix actions
    expect(markup).toContain('create');
    expect(markup).toContain('read');
    expect(markup).toContain('update');
    expect(markup).toContain('delete');
    expect(markup).toContain('manage');
  });

  it('renders system roles correctly', () => {
    const markup = renderToStaticMarkup(createElement(RoleManagementPage));
    
    expect(markup).toContain('Platform Admin');
    expect(markup).toContain('Agency Owner');
    expect(markup).toContain('System Role');
  });
});
