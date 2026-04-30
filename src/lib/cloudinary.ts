import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export type CloudinaryDeliveryResourceType = 'image' | 'raw';

export function getCloudinaryDeliveryResourceType(mimeType: string): CloudinaryDeliveryResourceType {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf' ? 'image' : 'raw';
}

export function getCloudinaryFormat(mimeType: string, originalName = ''): string {
  const extension = originalName.includes('.') ? originalName.split('.').pop()?.toLowerCase() : undefined;

  if (extension) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }

  const mimeFormats: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };

  return mimeFormats[mimeType] ?? 'bin';
}

export function getCloudinaryPrivateDownloadUrl(
  publicId: string,
  mimeType: string,
  originalName = '',
): string {
  return cloudinary.utils.private_download_url(publicId, getCloudinaryFormat(mimeType, originalName), {
    resource_type: getCloudinaryDeliveryResourceType(mimeType),
    type: 'upload',
  });
}

export async function uploadToCloudinary(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder = 'contact-center/candidates'
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
        } else {
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      }
    );
    uploadStream.end(buffer);
  });
}

export async function deleteFromCloudinary(publicId: string, resourceType: string = 'raw'): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType as 'raw' | 'image' | 'video' });
}
