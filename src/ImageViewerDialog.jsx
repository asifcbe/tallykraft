import React, { useState, useEffect } from 'react';
import { Box, Dialog, IconButton, Typography, CircularProgress, alpha } from '@mui/material';
import { X, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { getImagesForRecord, getImageObjectUrl } from './referenceImages';

/**
 * Read-only gallery viewer for a sale/purchase record's attached reference
 * images — prev/next through all of them, no upload/delete (that's what
 * ReferenceImagesPanel is for, inside the edit form). Purely local: reads
 * straight from IndexedDB via referenceImages.js, same as everywhere else.
 */
const ImageViewerDialog = ({ open, onClose, recordId }) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);

  // Fetch-on-open effect — same react-hooks/set-state-in-effect warning
  // already present ~25x elsewhere in this codebase (incl. this file's
  // sibling ReferenceImagesPanel.jsx) for the identical "load on mount/id
  // change" pattern; not fought further here for consistency.
  useEffect(() => {
    let cancelled = false;
    if (!open || !recordId) { setImages([]); setIndex(0); return; }
    setLoading(true);
    getImagesForRecord(recordId)
      .then((imgs) => { if (!cancelled) { setImages(imgs); setIndex(0); } })
      .catch((e) => console.error('[ImageViewerDialog] load failed:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, recordId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, images.length, onClose]);

  const current = images[index];
  const url = current ? getImageObjectUrl(current) : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <Box sx={{ position: 'relative', bgcolor: '#000', minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, bgcolor: alpha('#000', 0.4) }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>
            {images.length > 0 ? `Reference Image ${index + 1} of ${images.length}` : 'Reference Images'}
          </Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}>
            <X size={18} />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 320 }}>
          {loading ? (
            <CircularProgress sx={{ color: '#fff' }} />
          ) : !current ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'rgba(255,255,255,0.6)' }}>
              <ImageOff size={32} />
              <Typography variant="caption">No reference images on this record</Typography>
            </Box>
          ) : (
            <>
              {images.length > 1 && (
                <IconButton
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  sx={{ position: 'absolute', left: 8, color: '#fff', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)' } }}
                >
                  <ChevronLeft size={22} />
                </IconButton>
              )}
              <Box component="img" src={url} alt={current.fileName} sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />
              {images.length > 1 && (
                <IconButton
                  onClick={() => setIndex((i) => Math.min(images.length - 1, i + 1))}
                  disabled={index === images.length - 1}
                  sx={{ position: 'absolute', right: 8, color: '#fff', bgcolor: 'rgba(255,255,255,0.12)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)' } }}
                >
                  <ChevronRight size={22} />
                </IconButton>
              )}
            </>
          )}
        </Box>

        {current && (
          <Typography sx={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', py: 1, fontSize: '0.75rem' }}>
            {current.fileName}
          </Typography>
        )}

        {images.length > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, pb: 1.5 }}>
            {images.map((img, i) => (
              <Box
                key={img.id}
                onClick={() => setIndex(i)}
                sx={{
                  width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                  bgcolor: i === index ? '#fff' : 'rgba(255,255,255,0.35)',
                  transition: 'background-color 0.15s',
                }}
              />
            ))}
          </Box>
        )}
      </Box>
    </Dialog>
  );
};

export default ImageViewerDialog;
