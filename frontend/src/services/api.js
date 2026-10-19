import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Attach JWT token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Redirect to login on 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Only redirect if not already on login or register
      if (
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/register'
      ) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/* ==========================================================================
   Auth Endpoints
   ========================================================================== */
export const register = async (userData) => {
  const response = await api.post('/auth/register', userData);
  return response.data;
};

export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const logout = async () => {
  try {
    await api.post('/auth/logout');
  } catch (err) {
    console.error('Logout request failed', err);
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

/* ==========================================================================
   Analyses Endpoints
   ========================================================================== */
export const uploadFiles = async (formData, onUploadProgress) => {
  const response = await api.post('/analyses', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress,
  });
  return response.data;
};

export const getAnalyses = async (params = {}) => {
  const response = await api.get('/analyses', { params });
  return response.data;
};

export const getAnalysis = async (id) => {
  const response = await api.get(`/analyses/${id}`);
  return response.data;
};

export const getAnalysisDetections = async (id, params = {}) => {
  const response = await api.get(`/analyses/${id}/detections`, { params });
  return response.data;
};

export const deleteAnalysis = async (id) => {
  const response = await api.delete(`/analyses/${id}`);
  return response.data;
};

/* ==========================================================================
   Dashboard & Analytics Endpoints
   ========================================================================== */
export const getDashboardStats = async () => {
  const response = await api.get('/dashboard/stats');
  return response.data;
};

export const getViolations = async (params = {}) => {
  const response = await api.get('/analytics/violations', { params });
  return response.data;
};

export const getMediaComparison = async () => {
  const response = await api.get('/analytics/media-comparison');
  return response.data;
};

export const getConfidenceDistribution = async (params = {}) => {
  const response = await api.get('/analytics/confidence', { params });
  return response.data;
};

export const getTimeline = async (params = {}) => {
  const response = await api.get('/analytics/timeline', { params });
  return response.data;
};

export const getVideoTimeline = async (analysisId) => {
  const response = await api.get(`/analytics/video-timeline/${analysisId}`);
  return response.data;
};

/* ==========================================================================
   File URLs & Download Helpers
   ========================================================================== */

/**
 * Returns a URL suitable for use in <a href> or <img src> directly in the browser.
 * These go through Vite's /api proxy to Flask.
 */
export const getOutputUrl = (analysisId) => {
  return `/api/analyses/${analysisId}/output`;
};

export const getOriginalUrl = (analysisId) => {
  return `/api/analyses/${analysisId}/original`;
};

export const getReportUrl = (analysisId) => {
  return `/api/analyses/${analysisId}/report`;
};

/**
 * Fetches a media file via the authenticated axios instance and returns a
 * temporary blob object URL that can be used as <img src> or <video src>.
 *
 * IMPORTANT: `url` must be a path RELATIVE to the axios baseURL (/api).
 * e.g. pass "/analyses/5/output", NOT "/api/analyses/5/output"
 */
export const fetchMediaBlobUrl = async (url) => {
  // Strip a leading /api prefix so we don't double up with baseURL='/api'
  const cleanUrl = url.startsWith('/api/') ? url.slice(4) : url;
  const response = await api.get(cleanUrl, { responseType: 'blob' });
  return URL.createObjectURL(response.data);
};

export const downloadReportFile = async (analysisId, filename = 'report.csv') => {
  const response = await api.get(`/analyses/${analysisId}/report`, {
    responseType: 'blob',
  });
  const blobUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
};

export default api;
