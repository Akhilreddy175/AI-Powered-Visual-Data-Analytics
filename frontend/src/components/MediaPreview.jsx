import { useState, useEffect } from 'react';
import { fetchMediaBlobUrl } from '../services/api';
import { Maximize2, X, AlertCircle, Loader2 } from 'lucide-react';

export default function MediaPreview({
  src,
  mediaType = 'image',
  alt = 'Media preview',
  className = '',
  aspectRatio = 'aspect-video',
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl = null;

    if (!src) {
      setLoading(false);
      setError(true);
      return;
    }

    const loadMedia = async () => {
      try {
        setLoading(true);
        setError(false);
        const url = await fetchMediaBlobUrl(src);
        if (active) {
          createdUrl = url;
          setBlobUrl(url);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error('Failed to load media preview:', err);
          setError(true);
          setLoading(false);
        }
      }
    };

    loadMedia();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div
        className={`w-full ${aspectRatio} flex flex-col items-center justify-center bg-slate-900/5 rounded-xl border border-slate-200 text-slate-400 ${className}`}
      >
        <Loader2 className="w-7 h-7 animate-spin text-blue-600 mb-2" />
        <span className="text-xs font-medium text-slate-500">Loading media...</span>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div
        className={`w-full ${aspectRatio} flex flex-col items-center justify-center bg-slate-100 rounded-xl border border-slate-200 text-slate-400 p-4 ${className}`}
      >
        <AlertCircle className="w-6 h-6 text-slate-400 mb-1" />
        <span className="text-xs font-medium text-slate-500">Unable to load preview</span>
      </div>
    );
  }

  return (
    <>
      <div className={`relative group overflow-hidden rounded-xl border border-slate-200 bg-black/90 ${className}`}>
        {mediaType === 'video' ? (
          <video
            controls
            src={blobUrl}
            className={`w-full ${aspectRatio} object-contain`}
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="relative">
            <img
              src={blobUrl}
              alt={alt}
              className={`w-full ${aspectRatio} object-contain`}
            />
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
              title="View full image"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen modal for images */}
      {isModalOpen && mediaType === 'image' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute -top-10 right-0 p-1.5 text-white/80 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={blobUrl}
              alt={alt}
              className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
