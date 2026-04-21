import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireCatalogTenantContext } from './shared.js';

function getExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.trim();
  return extension && extension.length > 0 ? extension : 'bin';
}

export async function registerCatalogUploadRoutes(fastify: FastifyInstance) {
  fastify.post('/upload', async (request, reply) => {
    const context = await requireCatalogTenantContext(request, reply);
    if (!context) {
      return;
    }

    try {
      if (!request.isMultipart()) {
        return reply.status(400).send({ error: 'No file provided' });
      }

      const filePart = await request.file();
      if (!filePart || filePart.fieldname !== 'file') {
        return reply.status(400).send({ error: 'No file provided' });
      }

      const buffer = await filePart.toBuffer();
      const uploadDir = path.resolve(process.cwd(), 'public/uploads');
      await mkdir(uploadDir, { recursive: true });

      const originalFileName = filePart.filename || 'upload.bin';
      const extension = getExtension(originalFileName);
      const filename = `${Date.now()}-${randomUUID()}.${extension}`;
      const filePath = path.join(uploadDir, filename);
      await writeFile(filePath, buffer);

      const mimeType = filePart.mimetype || 'application/octet-stream';
      return reply.send({
        url: `/uploads/${filename}`,
        filename: originalFileName,
        type: mimeType,
        size: buffer.byteLength,
        isImage: mimeType.startsWith('image/'),
        isPdf: mimeType === 'application/pdf',
        needsReview: true,
        aiAnalysis: [],
        serviceCount: 0,
      });
    } catch (error) {
      request.log.error(error, 'Upload route failed');
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });
}
