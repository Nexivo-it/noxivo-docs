import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../lib/auth/session';

interface ServiceResult {
  name: string;
  price: number;
  duration: number;
  description: string;
  category: string;
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const uploadDir = './public/uploads';
    const fs = await import('fs/promises');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const ext = file.name.split('.').pop() || 'bin';
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const filename = `${uniqueId}.${ext}`;
    const filepath = `${uploadDir}/${filename}`;
    
    await fs.writeFile(filepath, buffer);
    
    const publicUrl = `/uploads/${filename}`;
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    
    const aiAnalysis: ServiceResult[] = [];
    
    return NextResponse.json({ 
      url: publicUrl,
      filename: file.name,
      type: file.type,
      size: file.size,
      isImage,
      isPdf,
      needsReview: true,
      aiAnalysis,
      serviceCount: 0
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}