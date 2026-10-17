import { useState, useRef } from 'react';
import { UploadCloud, File, Film, Image as ImageIcon, X, AlertCircle } from 'lucide-react';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'mp4', 'avi', 'mov', 'mkv', 'm4v'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'video/mp4',
  'video/x-msvideo',
  'video/quicktime',
  'video/x-matroska',
];

export default function FileDropZone({ files, setFiles, disabled = false }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const fileInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateAndAddFiles = (incomingFiles) => {
    setErrorMessage(null);
    const validFiles = [];
    const invalidNames = [];

    Array.from(incomingFiles).forEach((file) => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        // Prevent duplicate files in the list
        const alreadyExists = files.some(
          (f) => f.name === file.name && f.size === file.size
        );
        if (!alreadyExists) {
          validFiles.push(file);
        }
      } else {
        invalidNames.push(file.name);
      }
    });

    if (invalidNames.length > 0) {
      setErrorMessage(
        `Unsupported file type: ${invalidNames.join(', ')}. Allowed: JPG, PNG, MP4, AVI, MOV, MKV.`
      );
    }

    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
      // Reset input value to allow re-uploading the same file if removed
      e.target.value = '';
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isVideo = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    return ['mp4', 'avi', 'mov', 'mkv', 'm4v'].includes(ext);
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
          disabled
            ? 'opacity-60 bg-slate-100 border-slate-300 cursor-not-allowed'
            : isDragOver
            ? 'border-blue-500 bg-blue-50/50 scale-[1.005]'
            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.mp4,.avi,.mov,.mkv,.m4v,image/jpeg,image/png,video/mp4,video/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 shadow-xs">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-base font-semibold text-slate-800 mb-1">
          Drag & drop images or videos here, or{' '}
          <span className="text-blue-600 underline underline-offset-2">browse</span>
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mb-2">
          Supports high-resolution images (JPG, PNG) and workplace CCTV / inspection videos (MP4, AVI, MOV, MKV).
        </p>
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
          Max batch size: up to 10 files
        </span>
      </div>

      {/* Validation Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Selected Files List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 uppercase tracking-wider px-1">
            <span>Selected Files ({files.length})</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => setFiles([])}
                className="text-rose-600 hover:text-rose-700 normal-case font-medium hover:underline cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
            {files.map((file, idx) => {
              const video = isVideo(file.name);
              return (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        video
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {video ? (
                        <Film className="w-4 h-4" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatFileSize(file.size)} • {video ? 'Video' : 'Image'}
                      </p>
                    </div>
                  </div>

                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
