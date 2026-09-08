/**
 * Reference image attachments for Sales/Purchases — local-only storage.
 *
 * Images are compressed/resized client-side, stored as Blobs in the
 * `referenceImages` IndexedDB store (see indexedDB.js), and referenced from
 * the sale/purchase record ONLY via a lightweight `referenceImageIds: []`
 * array of string ids. The blobs themselves never touch DataContext's
 * Firestore sync path — a sale/purchase row full-syncs online, so putting
 * base64 image bytes on it would blow past Firestore's ~1MiB per-document
 * limit with even a single photo. Only this ids array (a few short strings)
 * rides along on the synced record.
 */
import {
  saveReferenceImage as idbSaveImage,
  getReferenceImages as idbGetImages,
  deleteReferenceImage as idbDeleteImage,
  deleteReferenceImagesForRecord as idbDeleteImagesForRecord,
  getAllReferenceImagesForBusiness as idbGetAllForBusiness,
} from './indexedDB';

export const MAX_REFERENCE_IMAGES = 5;
const MAX_DIMENSION = 1600; // px, longest side
const JPEG_QUALITY = 0.8;

// A, B, C, D, E — matches the user-facing naming convention
// (INV-0001_A.jpg, INV-0001_B.jpg, ...) used in the printed/export filename.
export const IMAGE_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Downscale + re-encode an image file as JPEG via canvas, so 5 attachments
 * per invoice don't quickly fill up the browser's IndexedDB storage quota
 * (a raw phone-camera photo can be 3-8MB; this typically lands at 100-400KB).
 */
export function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image file')); };
    img.src = url;
  });
}

/**
 * Compress and save a new reference image for a sale/purchase record.
 * `existingCount` determines the next A/B/C/D/E letter — pass the current
 * length of the record's referenceImageIds array.
 * Returns { id, letter } to append to the record's referenceImageIds.
 */
export async function addReferenceImage(file, { recordId, table, businessId, invoiceNumber, existingCount }) {
  if (existingCount >= MAX_REFERENCE_IMAGES) {
    throw new Error(`Maximum ${MAX_REFERENCE_IMAGES} images per ${table === 'sales' ? 'invoice' : 'bill'}`);
  }
  const letter = IMAGE_LETTERS[existingCount] || IMAGE_LETTERS[IMAGE_LETTERS.length - 1];
  const blob = await compressImage(file);
  const safeNumber = (invoiceNumber || 'UNSAVED').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeNumber}_${letter}.jpg`;
  const id = await idbSaveImage({ recordId, table, businessId, letter, fileName, mimeType: 'image/jpeg', blob });
  return { id, letter, fileName };
}

export async function getImagesForRecord(recordId) {
  return idbGetImages(recordId);
}

export async function removeReferenceImage(imageId) {
  return idbDeleteImage(imageId);
}

export async function removeAllImagesForRecord(recordId) {
  return idbDeleteImagesForRecord(recordId);
}

export async function getAllImagesForBusiness(businessId) {
  return idbGetAllForBusiness(businessId);
}

/**
 * Re-import an image blob during backup restore. Unlike addReferenceImage
 * (which generates a fresh letter/filename from a freshly-picked File),
 * this writes back exactly what was in the export — same recordId/letter/
 * fileName — since restoreFromFile preserves the original sale/purchase row
 * ids, so images re-associate with their invoice correctly with no
 * remapping needed.
 */
export async function restoreReferenceImage({ recordId, table, businessId, letter, fileName, blob }) {
  return idbSaveImage({ recordId, table, businessId, letter, fileName, mimeType: blob.type || 'image/jpeg', blob });
}

/**
 * Object URL cache so <img> tags don't re-create (and leak) a new blob URL
 * on every render. Caller is responsible for calling revokeImageUrl when the
 * image is removed from view (e.g. dialog closed, row deleted).
 */
const urlCache = new Map();
export function getImageObjectUrl(image) {
  if (!image?.id || !image?.blob) return null;
  if (urlCache.has(image.id)) return urlCache.get(image.id);
  const url = URL.createObjectURL(image.blob);
  urlCache.set(image.id, url);
  return url;
}
export function revokeImageUrl(imageId) {
  const url = urlCache.get(imageId);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(imageId); }
}
