import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, Button, CircularProgress, Dialog, Tooltip, alpha, useTheme } from '@mui/material';
import { Camera, Upload, X, ImageOff, ZoomIn } from 'lucide-react';
import {
  MAX_REFERENCE_IMAGES, addReferenceImage, getImagesForRecord, removeReferenceImage,
  getImageObjectUrl, revokeImageUrl,
} from './referenceImages';

/**
 * Reference image attachments — up to MAX_REFERENCE_IMAGES thumbnails with
 * Upload / Camera buttons and a lightbox preview. Fully local: reads/writes
 * IndexedDB directly, never touches DataContext/Firestore. The parent only
 * needs to pass `recordId` (a stable id — see Sales.jsx's `pendingRecordId`
 * for how a not-yet-saved new invoice still gets one) and keep
 * `referenceImageIds` in sync via `onIdsChange` so the count travels with
 * the sale/purchase record when it's actually saved.
 */
const ReferenceImagesPanel = ({ recordId, table, businessId, invoiceNumber, referenceImageIds, onIdsChange, disabled = false }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);

  // Plain async fn (not useCallback) — called directly after a mutation
  // (upload/delete, both real event handlers) to refresh the thumbnail
  // list. The effect below has its own inlined fetch instead of calling
  // this, since calling a state-setting function from inside an effect body
  // is what the lint rule (react-hooks/set-state-in-effect) flags.
  const reload = async () => {
    if (!recordId) { setImages([]); return; }
    setLoading(true);
    try {
      const imgs = await getImagesForRecord(recordId);
      setImages(imgs);
    } catch (e) {
      console.error('[ReferenceImagesPanel] load failed:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    if (!recordId) { setImages([]); return; }
    setLoading(true);
    getImagesForRecord(recordId)
      .then((imgs) => { if (!cancelled) setImages(imgs); })
      .catch((e) => console.error('[ReferenceImagesPanel] load failed:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recordId]);

  // Revoke object URLs for images no longer in view when unmounting.
  useEffect(() => () => { images.forEach(img => revokeImageUrl(img.id)); }, [images]);

  const handleFile = async (file) => {
    if (!file || !recordId) return;
    setError('');
    if (images.length >= MAX_REFERENCE_IMAGES) {
      setError(`Maximum ${MAX_REFERENCE_IMAGES} images reached`);
      return;
    }
    setUploading(true);
    try {
      const { id } = await addReferenceImage(file, {
        recordId, table, businessId, invoiceNumber, existingCount: images.length,
      });
      const nextIds = [...(referenceImageIds || []), id];
      onIdsChange?.(nextIds);
      await reload();
    } catch (e) {
      console.error('[ReferenceImagesPanel] add failed:', e);
      setError(e?.message || 'Could not add image');
    }
    setUploading(false);
  };

  const handleDelete = async (image) => {
    try {
      await removeReferenceImage(image.id);
      revokeImageUrl(image.id);
      onIdsChange?.((referenceImageIds || []).filter(id => id !== image.id));
      await reload();
    } catch (e) {
      console.error('[ReferenceImagesPanel] delete failed:', e);
    }
  };

  const atLimit = images.length >= MAX_REFERENCE_IMAGES;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem' }}>
          Reference Images
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {images.length}/{MAX_REFERENCE_IMAGES} · saved on this device only
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72 }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          images.map((img) => {
            const url = getImageObjectUrl(img);
            return (
              <Box key={img.id} sx={{ position: 'relative', width: 72, height: 72, borderRadius: '10px', overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                {url ? (
                  <Box
                    component="img"
                    src={url}
                    alt={img.fileName}
                    onClick={() => setLightbox(img)}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                  />
                ) : (
                  <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                    <ImageOff size={20} color="#94a3b8" />
                  </Box>
                )}
                <Box sx={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, px: 0.5, py: 0.25,
                  bgcolor: alpha('#000', 0.55), textAlign: 'center',
                }}>
                  <Typography sx={{ color: '#fff', fontSize: '0.6rem', fontWeight: 800, lineHeight: 1.2 }}>{img.letter}</Typography>
                </Box>
                {!disabled && (
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(img)}
                    sx={{
                      position: 'absolute', top: 2, right: 2, width: 20, height: 20,
                      bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                      '&:hover': { bgcolor: 'error.main' },
                    }}
                  >
                    <X size={12} />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  onClick={() => setLightbox(img)}
                  sx={{
                    position: 'absolute', top: 2, left: 2, width: 20, height: 20,
                    bgcolor: 'rgba(0,0,0,0.4)', color: '#fff', opacity: 0.85,
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                  }}
                >
                  <ZoomIn size={12} />
                </IconButton>
              </Box>
            );
          })
        )}

        {!disabled && !atLimit && (
          <>
            <Tooltip title="Upload from device">
              <Button
                component="label"
                disabled={uploading || !recordId}
                sx={{
                  width: 72, height: 72, minWidth: 72, borderRadius: '10px',
                  border: '1.5px dashed', borderColor: alpha(primary, 0.4),
                  color: primary, display: 'flex', flexDirection: 'column', gap: 0.25,
                  '&:hover': { bgcolor: alpha(primary, 0.06), borderColor: primary },
                }}
              >
                {uploading ? <CircularProgress size={16} /> : <Upload size={18} />}
                <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'none' }}>Upload</Typography>
                <input type="file" hidden accept="image/*" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
              </Button>
            </Tooltip>
            <Tooltip title="Take a photo">
              <Button
                component="label"
                disabled={uploading || !recordId}
                sx={{
                  width: 72, height: 72, minWidth: 72, borderRadius: '10px',
                  border: '1.5px dashed', borderColor: alpha(primary, 0.4),
                  color: primary, display: 'flex', flexDirection: 'column', gap: 0.25,
                  '&:hover': { bgcolor: alpha(primary, 0.06), borderColor: primary },
                }}
              >
                {uploading ? <CircularProgress size={16} /> : <Camera size={18} />}
                <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'none' }}>Camera</Typography>
                <input type="file" hidden accept="image/*" capture="environment" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
              </Button>
            </Tooltip>
          </>
        )}
      </Box>

      {error && <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>{error}</Typography>}

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="sm" fullWidth>
        {lightbox && (
          <Box sx={{ position: 'relative', bgcolor: '#000' }}>
            <IconButton onClick={() => setLightbox(null)} sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
              <X size={18} />
            </IconButton>
            <Box component="img" src={getImageObjectUrl(lightbox)} alt={lightbox.fileName} sx={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }} />
            <Typography sx={{ color: '#fff', textAlign: 'center', py: 1, fontSize: '0.8rem', fontWeight: 600 }}>{lightbox.fileName}</Typography>
          </Box>
        )}
      </Dialog>
    </Box>
  );
};

export default ReferenceImagesPanel;
