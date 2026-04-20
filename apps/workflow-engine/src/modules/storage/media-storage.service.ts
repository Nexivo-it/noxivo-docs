import { MediaStorageConfigModel } from '@noxivo/database';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v2 as cloudinary } from 'cloudinary';
import ImageKit, { toFile } from '@imagekit/nodejs';
import { google } from 'googleapis';
import crypto from 'crypto';
import { Readable } from 'stream';

export class MediaStorageService {
  async processMedia(agencyId: string, wahaUrl: string, mimeType: string, filename?: string): Promise<string> {
    try {
      const config = await MediaStorageConfigModel.findOne({ agencyId, isActive: true }).lean();
      if (!config) {
        return wahaUrl; // Fallback to WAHA URL if no config
      }

      // 1. Download buffer from WAHA proxy
      // The wahaUrl is usually a proxy URL from the UI or an absolute URL from WAHA.
      // If it's a relative URL from our own API, we need to construct it properly,
      // but assuming it's the absolute WAHA download URL for now.
      const baseUrlCandidate = process.env.MESSAGING_PROVIDER_PROXY_BASE_URL ?? process.env.MESSAGING_PROVIDER_BASE_URL;
      const apiKey = process.env.MESSAGING_PROVIDER_API_KEY ?? 'messagingSecretKey2025!';
      
      let downloadUrl = wahaUrl;
      if (wahaUrl.startsWith('/api/files')) {
        downloadUrl = `${baseUrlCandidate?.replace(/\/$/, '')}${wahaUrl}`;
      }

      const response = await fetch(downloadUrl, {
        headers: {
           'Accept': '*/*',
           'X-Api-Key': apiKey,
        }
      });

      if (!response.ok) {
        console.error('Failed to download media from WAHA:', response.statusText);
        return wahaUrl;
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = filename ? filename.split('.').pop() : mimeType.split('/')[1] || 'bin';
      const safeFilename = filename ? filename.replace(/[^a-zA-Z0-9.-]/g, '_') : `upload.${ext}`;
      const uniqueFilename = `${crypto.randomUUID()}-${safeFilename}`;

      // 2. Upload based on config
      switch (config.provider) {
        case 's3':
          return await this.uploadToS3(config, buffer, mimeType, uniqueFilename);
        case 'cloudinary':
          return await this.uploadToCloudinary(config, buffer, mimeType, uniqueFilename);
        case 'imagekit':
          return await this.uploadToImageKit(config, buffer, mimeType, uniqueFilename);
        case 'google_drive':
          return await this.uploadToGoogleDrive(config, buffer, mimeType, uniqueFilename);
        default:
          return wahaUrl;
      }
    } catch (e) {
      console.error(`MediaStorageService Error:`, e);
      return wahaUrl; // graceful fallback
    }
  }

  private async uploadToS3(config: any, buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const secretConfig = config.secretConfig || {};
    const publicConfig = config.publicConfig || {};
    
    const client = new S3Client({
      region: secretConfig.region || 'us-east-1',
      credentials: {
        accessKeyId: secretConfig.accessKeyId,
        secretAccessKey: secretConfig.secretAccessKey,
      },
      endpoint: secretConfig.endpoint, // for spaces, r2, etc
      forcePathStyle: publicConfig.forcePathStyle === true,
    });

    const key = config.pathPrefix ? `${config.pathPrefix.replace(/\/$/, '')}/${filename}` : filename;

    await client.send(new PutObjectCommand({
      Bucket: secretConfig.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'public-read',
    }));

    if (config.publicBaseUrl) {
      return `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    
    // Default S3 URL if publicBaseUrl isn't provided
    return `https://${secretConfig.bucket}.s3.${secretConfig.region || 'us-east-1'}.amazonaws.com/${key}`;
  }

  private async uploadToCloudinary(config: any, buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const secretConfig = config.secretConfig || {};
    cloudinary.config({
      cloud_name: secretConfig.cloudName,
      api_key: secretConfig.apiKey,
      api_secret: secretConfig.apiSecret,
    });

    const folder = config.pathPrefix ? config.pathPrefix.replace(/\/$/, '') : undefined;
    const public_id = filename.split('.')[0]; // Cloudinary handles extensions automatically

    return new Promise((resolve, reject) => {
      const uploadOptions: any = { resource_type: 'auto' };
      if (folder) uploadOptions.folder = folder;
      if (public_id) uploadOptions.public_id = public_id;

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) return reject(error);
          resolve(result!.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  private async uploadToImageKit(config: any, buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const secretConfig = config.secretConfig || {};
    const imagekit = new ImageKit({
      privateKey: secretConfig.privateKey,
    });

    const folder = config.pathPrefix ? `/${config.pathPrefix.replace(/\/$/, '')}` : '/';

    const result = await imagekit.files.upload({
      file: await toFile(buffer, filename, { type: mimeType }),
      fileName: filename,
      folder,
    });

    return result.url ?? '';
  }

  private async uploadToGoogleDrive(config: any, buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const secretConfig = config.secretConfig || {};
    
    // Assumes secretConfig contains service account JSON fields
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: secretConfig.clientEmail,
        private_key: secretConfig.privateKey?.replace(/\\n/g, '\\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const folderId = secretConfig.folderId; // Drive folder ID

    const requestBody: any = { name: filename };
    if (folderId) requestBody.parents = [folderId];

    const response: any = await drive.files.create({
      requestBody,
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    if (response.data?.id) {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    return response.data?.webContentLink || response.data?.webViewLink || '';
  }
}
