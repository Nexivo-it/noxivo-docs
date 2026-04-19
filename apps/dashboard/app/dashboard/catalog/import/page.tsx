'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, ArrowRight, Loader2, Plus, X, Download, FileJson, FileCode, FileSpreadsheet, Link2 } from 'lucide-react';

type FieldMapping = {
  sourceField: string;
  targetField: string;
};

type ParsedService = {
  name?: string;
  price?: number;
  duration?: number;
  description?: string;
  category?: string;
};

const FILE_TYPES = [
  { type: 'json', label: 'JSON', icon: FileJson, extensions: '.json' },
  { type: 'csv', label: 'CSV', icon: FileSpreadsheet, extensions: '.csv' },
  { type: 'md', label: 'Markdown', icon: FileCode, extensions: '.md,.markdown' },
  { type: 'txt', label: 'Text', icon: FileText, extensions: '.txt' },
  { type: 'image', label: 'Image (AI)', icon: Upload, extensions: '.jpg,.jpeg,.png,.webp' },
  { type: 'pdf', label: 'PDF (AI)', icon: FileText, extensions: '.pdf' },
];

const FIELD_OPTIONS = [
  { value: 'name', label: 'Service Name' },
  { value: 'price', label: 'Price' },
  { value: 'duration', label: 'Duration (min)' },
  { value: 'description', label: 'Description' },
  { value: 'category', label: 'Category' },
];

const TEMPLATES = {
  json: `[
  {
    "name": "Haircut",
    "price": 35,
    "duration": 30,
    "description": "Classic haircut with styling",
    "category": "hair"
  },
  {
    "name": "Hair Coloring",
    "price": 85,
    "duration": 120,
    "description": "Full hair coloring service",
    "category": "hair"
  }
]`,
  csv: `name,price,duration,description,category
Haircut,35,30,Classic haircut with styling,hair
Hair Coloring,85,120,Full hair coloring service,hair`,
  md: `| Service | Price | Duration | Description |
|-------|-------|----------|-------------|
| Haircut | $35 | 30 min | Classic haircut with styling |
| Hair Coloring | $85 | 120 min | Full hair coloring |`,
};

export default function CatalogImport() {
  const [fileType, setFileType] = useState('json');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedService[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([
    { sourceField: 'name', targetField: 'name' },
    { sourceField: 'price', targetField: 'price' },
    { sourceField: 'duration', targetField: 'duration' },
    { sourceField: 'description', targetField: 'description' },
    { sourceField: 'category', targetField: 'category' },
  ]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const content = TEMPLATES[fileType as keyof typeof TEMPLATES] || TEMPLATES.json;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalog-template.${fileType === 'md' ? 'md' : fileType}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseFile = async (file: File) => {
    setUploading(true);
    try {
      if (fileType === 'image' || fileType === 'pdf') {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/catalog/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error('Upload failed');
        
        const data = await response.json();
        
        toast.success('File analyzed! Review extracted services below.');
        setParsedData(data.aiAnalysis || []);
      } else {
        const text = await file.text();
        let parsed: ParsedService[] = [];

        if (fileType === 'json') {
          parsed = JSON.parse(text);
        } else if (fileType === 'csv') {
          const lines = text.trim().split('\n');
          const headerLine = lines[0] || '';
          const headers = headerLine.split(',').map((h: string) => h.trim().toLowerCase());
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !line.trim()) continue;
            const values = line.split(',');
            const row: Record<string, string> = {};
            headers.forEach((h: string, idx: number) => { row[h] = values[idx]?.trim() || ''; });
            
            const item: ParsedService = {};
            fieldMappings.forEach(m => {
              const sourceVal = row[m.sourceField] || '';
              if (m.targetField === 'price') item.price = parseFloat(sourceVal) || 0;
              else if (m.targetField === 'duration') item.duration = parseInt(sourceVal) || 0;
              else (item as Record<string, unknown>)[m.targetField] = sourceVal;
            });
            parsed.push(item);
          }
        } else if (fileType === 'md' || fileType === 'txt') {
          const lines = text.split('\n').filter((l: string) => l.trim());
          const tableStart = text.indexOf('|');
          
          if (tableStart > -1 && text.includes('|')) {
            const tableLines = lines.filter((l: string) => l.includes('|') && !l.includes('---'));
            if (tableLines.length > 1) {
              const headerLine = tableLines[0] || '';
              const headers = headerLine.split('|').map((h: string) => h.trim().toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
              
              for (let i = 1; i < tableLines.length; i++) {
                const line = tableLines[i];
                if (!line) continue;
                const values = line.split('|').map((v: string) => v.trim()).filter(Boolean);
                const row: Record<string, string> = {};
                headers.forEach((h: string, idx: number) => { row[h] = values[idx] || ''; });
                
                const item: ParsedService = {};
                fieldMappings.forEach(m => {
                  const sourceVal = row[m.sourceField] || '';
                  if (m.targetField === 'price') item.price = parseFloat(sourceVal.replace(/[^0-9.]/g, '')) || 0;
                  else if (m.targetField === 'duration') item.duration = parseInt(sourceVal.replace(/[^0-9]/g, '')) || 0;
                  else (item as Record<string, unknown>)[m.targetField] = sourceVal;
                });
                parsed.push(item);
              }
            }
          } else {
            const priceMatch = text.match(/\$?(\d+(?:\.\d+)?)/g);
            let priceIdx = 0;
            
            for (const line of lines) {
              if (!line) continue;
              const cleanPrice = priceMatch?.[priceIdx]?.replace('$', '') || '';
              const price = cleanPrice ? parseFloat(cleanPrice) : 0;
              const name = line.replace(/\$?\d+(?:\.\d+)?/g, '').replace(/\|/g, '').trim();
              if (name) {
                parsed.push({ name, price, description: '' });
                priceIdx++;
              }
            }
          }
        }

        setParsedData(parsed);
        toast.success(`Found ${parsed.length} services`);
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast.error('Failed to parse file');
    } finally {
      setUploading(false);
    }
  };

  const saveServices = async () => {
    setSaving(true);
    try {
      let savedCount = 0;
      
      for (const item of parsedData) {
        const response = await fetch('/api/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: {
              name: item.name || 'Untitled',
              priceAmount: item.price || 0,
              durationMinutes: item.duration || 30,
              shortDescription: item.description || '',
              categoryId: item.category || '',
              itemType: 'service',
              status: 'needs_review',
            }
          }),
        });

        if (response.ok) savedCount++;
      }

      toast.success(`Saved ${savedCount} services!`);
      setParsedData([]);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save services');
    } finally {
      setSaving(false);
    }
  };

  const updateMapping = (index: number, targetField: string) => {
    const newMappings = [...fieldMappings];
    if (newMappings[index]) {
      newMappings[index].targetField = targetField;
      setFieldMappings(newMappings);
    }
  };

  const updateParsedItem = (index: number, field: string, value: string | number) => {
    const newData = [...parsedData];
    (newData[index] as Record<string, unknown>)[field] = value;
    setParsedData(newData);
  };

  const removeParsedItem = (index: number) => {
    setParsedData(parsedData.filter((_, i) => i !== index));
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)', padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Import Services</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Import From</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {FILE_TYPES.map(ft => {
                const Icon = ft.icon;
                const isActive = fileType === ft.type;
                return (
                  <button
                    key={ft.type}
                    onClick={() => { setFileType(ft.type); setParsedData([]); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: isActive ? 'var(--primary)' : 'var(--surface-card)',
                      color: isActive ? 'var(--primary-foreground)' : 'var(--foreground)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Icon size={18} />
                    {ft.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', cursor: 'pointer' }}>
            <Download size={18} /> Download Template
          </button>
        </div>

        <div>
          <div 
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) parseFile(file); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '3rem',
              textAlign: 'center',
              background: dragOver ? 'var(--surface-section)' : 'var(--surface-card)',
              cursor: 'pointer',
              marginBottom: '2rem',
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={48} style={{ margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
                <p>Analyzing file...</p>
              </>
            ) : (
              <>
                <Upload size={48} style={{ margin: '0 auto 1rem', color: 'var(--muted)' }} />
                <p style={{ fontWeight: 500 }}>Drop file here or click to upload</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Supports: JSON, CSV, Markdown, Text, Image, PDF</p>
              </>
            )}
            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} style={{ display: 'none' }} accept={FILE_TYPES.find(ft => ft.type === fileType)?.extensions} />
          </div>

          {parsedData.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Extracted Services ({parsedData.length})</h2>
                <button onClick={saveServices} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                  {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={18} />}
                  Save All to Catalog
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {parsedData.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)' }}>
                    <input 
                      value={item.name || ''} 
                      onChange={(e) => updateParsedItem(idx, 'name', e.target.value)}
                      placeholder="Service name"
                      style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                    />
                    <input 
                      value={item.price || ''} 
                      onChange={(e) => updateParsedItem(idx, 'price', parseFloat(e.target.value) || 0)}
                      placeholder="$"
                      type="number"
                      style={{ width: 80, padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                    />
                    <input 
                      value={item.duration || ''} 
                      onChange={(e) => updateParsedItem(idx, 'duration', parseInt(e.target.value) || 0)}
                      placeholder="min"
                      type="number"
                      style={{ width: 60, padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                    />
                    <input 
                      value={item.description || ''} 
                      onChange={(e) => updateParsedItem(idx, 'description', e.target.value)}
                      placeholder="Description"
                      style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                    />
                    <button onClick={() => removeParsedItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}