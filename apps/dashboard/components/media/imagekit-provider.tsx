'use client';

import React from 'react';
import { 
  ImageKitProvider, 
  Image, 
  Video, 
  upload,
  ImageKitContext
} from '@imagekit/react';
import { dashboardApi } from '@/lib/api/dashboard-api';

/**
 * Global authenticator function for ImageKit client-side uploads.
 * It calls our internal API which uses the private key to sign the request.
 */
const authenticator = async () => {
  try {
    return await dashboardApi.getImagekitAuth(); // { signature, token, expire, publicKey }
  } catch (error: any) {
    throw new Error(`Authentication request failed: ${error.message}`);
  }
};

interface ImageKitWrapperProps {
  urlEndpoint: string;
  publicKey?: string;
  children: React.ReactNode;
}

/**
 * ImageKitWrapper provides the necessary context for ImageKit components
 * (like <IKImage />, <IKVideo />, <IKUpload />) to work correctly.
 */
export function ImageKitWrapper({ 
  urlEndpoint, 
  publicKey, 
  children 
}: ImageKitWrapperProps) {
  return (
    <ImageKitProvider 
      urlEndpoint={urlEndpoint} 
    >
      {/* 
        We might need to pass publicKey down if IKUpload needs it, 
        but v5 ImageKitProvider doesn't accept it. 
      */}
      {children}
    </ImageKitProvider>
  );
}

// Re-export renamed components for compatibility
export { Image as IKImage, Video as IKVideo };

/**
 * Compatibility shim for the removed IKUpload component in v5.
 */
export const IKUpload = ({ 
  onSuccess, 
  onError, 
  onProgress,
  className,
  fileName,
  useUniqueFileName = true,
  tags,
  folder,
  publicKey: propPublicKey,
  ...props 
}: any) => {
  const context = React.useContext(ImageKitContext);
  const urlEndpoint = context.urlEndpoint;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const auth = await authenticator();
      const { publicKey: authPublicKey, ...authParams } = auth;
      const result = await upload({
        file,
        fileName: fileName || file.name,
        useUniqueFileName,
        tags,
        folder,
        publicKey: propPublicKey || authPublicKey,
        ...authParams,
      });

      if (onSuccess) onSuccess(result);
    } catch (err) {
      console.error('[IKUpload] Upload failed:', err);
      if (onError) onError(err);
    }
  };

  return (
    <input 
      type="file" 
      onChange={handleUpload} 
      className={className}
      {...props}
    />
  );
};
