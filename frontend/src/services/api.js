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
 */
export const fetchMediaBlobUrl = async (url) => {
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

/* ==========================================================================
   Document Intelligence Endpoints (Milestone 2)
   ========================================================================== */

/** Upload one or more documents (PDF/DOCX/TXT). Returns array of document objects. */
export const uploadDocuments = async (formData, onUploadProgress) => {
  const response = await api.post('/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });
  return response.data;
};

/** List all documents with optional filters: ?status=completed&file_type=pdf */
export const getDocuments = async (params = {}) => {
  const response = await api.get('/documents', { params });
  return response.data;
};

/** Get document repository summary statistics. */
export const getDocumentStats = async () => {
  const response = await api.get('/documents/stats');
  return response.data;
};

/** Get a single document's metadata by id. */
export const getDocument = async (id) => {
  const response = await api.get(`/documents/${id}`);
  return response.data;
};

/** Get paginated extracted text chunks for a document. */
export const getDocumentText = async (id, params = {}) => {
  const response = await api.get(`/documents/${id}/text`, { params });
  return response.data;
};

/** Get structured extracted facts (hazards, PPE requirements, etc.) */
export const getExtractedInfo = async (id) => {
  const response = await api.get(`/documents/${id}/extracted-info`);
  return response.data;
};

/** Trigger reprocessing of a document. */
export const reprocessDocument = async (id) => {
  const response = await api.post(`/documents/${id}/reprocess`);
  return response.data;
};

/** Delete a document and all its associated data. */
export const deleteDocument = async (id) => {
  const response = await api.delete(`/documents/${id}`);
  return response.data;
};

/** Download URL for original document file (use in <a href>). */
export const getDocumentDownloadUrl = (id) => `/api/documents/${id}/download`;

/* ==========================================================================
   Search & Knowledge Q&A Endpoints (Milestone 2)
   ========================================================================== */

/** Full-text search across the document knowledge base. */
export const searchDocuments = async (params = {}) => {
  // params: q, document_id, file_type, limit, offset
  const response = await api.get('/search', { params });
  return response.data;
};

/**
 * Ask a natural-language question. Returns supporting passages from the
 * actual document index (no LLM hallucinations — evidence-based retrieval).
 */
export const askKnowledgeBase = async (question, limit = 5) => {
  const response = await api.post('/knowledge/ask', { question, limit });
  return response.data;
};

/* ==========================================================================
   Milestone 3 — AI Investigation & RAG Endpoints
   ========================================================================== */

/**
 * Ask a multimodal RAG question — combines document retrieval + visual detections.
 * Optionally calls Gemini LLM if API key is configured.
 */
export const ragAsk = async (question, options = {}) => {
  const response = await api.post('/rag/ask', {
    question,
    include_visual: options.includeVisual !== false,
    document_id: options.documentId || null,
  });
  return response.data;
};

/**
 * Run the full LangGraph investigation workflow.
 * Returns workflow steps, incident info, and investigation summary.
 */
export const runInvestigation = async (question, options = {}) => {
  const response = await api.post('/investigate', {
    question,
    document_id: options.documentId || null,
  });
  return response.data;
};

/** Get visual detection summary (recent analyses + violations) for the current user. */
export const getDetectionSummary = async () => {
  const response = await api.get('/rag/detections');
  return response.data;
};

/* ==========================================================================
   Incident Management Endpoints (Milestone 3)
   ========================================================================== */

/** List incidents for the current user. */
export const getIncidents = async (params = {}) => {
  const response = await api.get('/incidents', { params });
  return response.data;
};

/** Get a single incident by ID. */
export const getIncident = async (id) => {
  const response = await api.get(`/incidents/${id}`);
  return response.data;
};

/** Delete an incident. */
export const deleteIncident = async (id) => {
  const response = await api.delete(`/incidents/${id}`);
  return response.data;
};

export default api;
