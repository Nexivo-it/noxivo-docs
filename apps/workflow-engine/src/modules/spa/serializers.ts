import { resolveSpaMediaUrl } from './media-url.service.js';

type SerializableService = {
  _id: { toString(): string } | string | number | bigint | boolean | null | undefined;
  name: string;
  description?: string | null;
  price?: number | null;
  durationLabel?: string | null;
  imageRef?: string | null;
};

type MediaConfig = {
  provider: 's3' | 'google_drive' | 'imagekit' | 'cloudinary';
  publicBaseUrl?: string | null;
  pathPrefix?: string | null;
} | null;

export function serializeSpaService(
  service: SerializableService,
  categoryName: string | null,
  mediaConfig: MediaConfig,
) {
  return {
    id: String(service._id),
    name: service.name,
    category: categoryName ?? 'General',
    duration: service.durationLabel ?? '',
    price: Number(service.price ?? 0),
    description: service.description ?? '',
    image_url: resolveSpaMediaUrl({
      assetPath: service.imageRef ?? null,
      config: mediaConfig,
    }),
  };
}
