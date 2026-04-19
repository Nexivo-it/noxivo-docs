'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Upload, Image, FileText, Link as LinkIcon, Plus, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CatalogImport() {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/imports', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      
      toast.success('File uploaded! Processing your catalog...');
    } catch (error) {
      console.error('Error uploading:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)', padding: '2rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard/catalog" style={{ display: 'flex', alignItems: 'center', color: 'var(--foreground)', textDecoration: 'none' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Import Services</h1>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <p style={{ marginBottom: '1.5rem', color: 'var(--muted)' }}>
          Upload your service menu to automatically import services. Supported formats: photos (JPEG, PNG), PDFs, or paste links to your website.
        </p>

        <div 
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '3rem',
            textAlign: 'center',
            background: dragOver ? 'var(--surface-section)' : 'var(--surface-card)',
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
        >
          {uploading ? (
            <>
              <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 1rem', color: 'var(--primary)' }} />
              <p>Processing your file...</p>
            </>
          ) : (
            <>
              <Upload size={48} style={{ margin: '0 auto 1rem', color: 'var(--muted)' }} />
              <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Drop files here or click to upload</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>JPEG, PNG, PDF up to 10MB</p>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
                id="file-upload"
              />
              <label htmlFor="file-upload" style={{ display: 'block', marginTop: '1rem' }}>
                <span style={{ 
                  display: 'inline-block', 
                  padding: '0.5rem 1rem', 
                  background: 'var(--primary)', 
                  color: 'var(--primary-foreground)', 
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}>
                  Select File
                </span>
              </label>
            </>
          )}
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Or import from:</h3>
          
          <div style={{ display: 'grid', gap: '1rem' }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', cursor: 'pointer' }}>
              <Image size={24} style={{ color: 'var(--primary)' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 500 }}>Photo / Screenshot</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Upload a photo of your menu</div>
              </div>
            </button>
            
            <button style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', cursor: 'pointer' }}>
              <FileText size={24} style={{ color: 'var(--primary)' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 500 }}>PDF Document</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Upload your PDF menu</div>
              </div>
            </button>
            
            <button style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', cursor: 'pointer' }}>
              <LinkIcon size={24} style={{ color: 'var(--primary)' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 500 }}>Website Link</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Paste a link to scrape services</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}