/**
 * SearchPage.jsx — SafeVision AI Knowledge Search
 *
 * Two distinct features:
 *   A. Document Search: full-text BM25/FTS5 search with filters and pagination.
 *   B. Knowledge Q&A: retrieval-based passage retrieval (no LLM generation).
 *
 * Backend: GET /api/search, POST /api/knowledge/ask
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search, BookOpen, AlertCircle, ChevronLeft, ChevronRight,
  Loader2, MessageSquare, FileText, Send, X, Filter,
  ExternalLink, Hash, ChevronDown, ChevronUp, Lightbulb,
  Database, Info
} from "lucide-react";
import { searchDocuments, askKnowledgeBase, getDocuments } from "../services/api";

/* ─────────────────────────── helpers ─────────────────────────────────── */
function FileTypeBadge({ type }) {
  const styles = {
    pdf:  "bg-red-50 text-red-600 border-red-200 ring-red-100",
    docx: "bg-blue-50 text-blue-600 border-blue-200 ring-blue-100",
    txt:  "bg-slate-100 text-slate-500 border-slate-200 ring-slate-100",
  };
  const k = (type || "").toLowerCase().replace(".", "");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase border tracking-wide ${styles[k] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
      {k || type || "?"}
    </span>
  );
}

function PageBadge({ page }) {
  if (page == null) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Hash className="w-3 h-3" /> pg {page}
    </span>
  );
}

const EXAMPLE_QUERIES = [
  "PPE requirements for construction workers",
  "hardhat safety regulations",
  "corrective actions in inspection report",
  "working at heights precautions",
  "electrical safety procedures",
  "accident reporting process",
];

const TYPE_FILTERS = ["all", "pdf", "docx", "txt"];
const LIMIT = 20;

/* ─────────────────────────── result card ─────────────────────────────── */
function ResultCard({ result, query, index }) {
  const [expanded, setExpanded] = useState(false);
  const hasLongSnippet = (result.snippet || "").length > 300;

  return (
    <article
      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150 overflow-hidden"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Header row */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <Link
            to={`/documents/${result.document_id}`}
            className="font-semibold text-[#E8630A] hover:text-[#c55108] hover:underline text-sm flex items-center gap-1 min-w-0"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-xs">{result.document_name}</span>
          </Link>
          <FileTypeBadge type={result.file_type} />
          <PageBadge page={result.page_number} />
        </div>

        {result.section_heading && (
          <div className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100 inline-flex items-center gap-1.5 mb-2">
            <span className="text-amber-400 font-bold">§</span>
            {result.section_heading}
          </div>
        )}
      </div>

      {/* Snippet */}
      <div className="px-5 pb-3">
        <div
          className={`text-sm text-slate-700 leading-relaxed [&_mark]:bg-amber-200 [&_mark]:text-amber-900 [&_mark]:rounded [&_mark]:px-0.5 [&_mark]:font-medium ${!expanded && hasLongSnippet ? "line-clamp-4" : ""}`}
          dangerouslySetInnerHTML={{ __html: result.snippet || "<em>No preview available.</em>" }}
        />
        {hasLongSnippet && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-1.5 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 pb-4 flex items-center gap-3 border-t border-slate-100 pt-3">
        <Link
          to={`/documents/${result.document_id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E8630A] hover:text-[#c55108] transition"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open document
        </Link>
        <Link
          to={`/documents/${result.document_id}?chunk=${result.chunk_id}&page=${result.page_number || ""}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition"
        >
          View source passage →
        </Link>
      </div>
    </article>
  );
}

/* ─────────────────────────── passage card (Q&A) ─────────────────────── */
function PassageCard({ passage, index }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Source metadata */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-700 truncate max-w-xs">
          {passage.document_name}
        </span>
        <FileTypeBadge type={passage.file_type} />
        <PageBadge page={passage.page_number} />
        {passage.section_heading && (
          <span className="text-xs text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            § {passage.section_heading}
          </span>
        )}
        {passage.document_id && (
          <Link
            to={`/documents/${passage.document_id}?chunk=${passage.chunk_id}&page=${passage.page_number || ""}`}
            className="ml-auto text-xs text-[#E8630A] hover:text-[#c55108] font-semibold flex items-center gap-1 transition"
          >
            <ExternalLink className="w-3 h-3" />
            View source
          </Link>
        )}
      </div>
      {/* Passage text — use `text` (raw chunk) with fallback to snippet */}
      <div className="px-4 py-3">
        <p className="text-xs leading-relaxed text-slate-700 italic">
          "{(passage.text || passage.snippet || "").replace(/<[^>]+>/g, "").substring(0, 500)}
          {(passage.text || passage.snippet || "").length > 500 ? "…" : ""}"
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── main component ─────────────────────────── */
export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── search state ── */
  const initialQ    = searchParams.get("q") || "";
  const initialType = searchParams.get("file_type") || "all";
  const initialOff  = parseInt(searchParams.get("offset") || "0", 10);

  const [inputValue, setInputValue] = useState(initialQ);
  const [query,      setQuery]      = useState(initialQ);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [offset,     setOffset]     = useState(initialOff);

  const [results,     setResults]     = useState([]);
  const [total,       setTotal]       = useState(0);
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(!!initialQ);

  /* ── document list for "search within" filter ── */
  const [docList, setDocList] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showDocFilter, setShowDocFilter] = useState(false);

  /* ── Q&A state ── */
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaLoading,  setQaLoading]  = useState(false);
  const [qaResult,   setQaResult]   = useState(null);
  const [qaError,    setQaError]    = useState(null);
  const [activeTab,  setActiveTab]  = useState("search"); // "search" | "qa"

  const debounceRef = useRef(null);
  const searchInputRef = useRef(null);

  /* ── load available documents for filter ── */
  useEffect(() => {
    getDocuments({ status: "completed" })
      .then(data => setDocList(data.documents || []))
      .catch(() => {});
  }, []);

  /* ── search runner ── */
  const runSearch = useCallback(async (q, type, off, docId) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);
    const params = { q, limit: LIMIT, offset: off };
    if (type !== "all") params.file_type = type;
    if (docId)          params.document_id = docId;
    try {
      const data = await searchDocuments(params);
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message || "Search failed.";
      setSearchError(msg);
      setResults([]);
      setTotal(0);
    } finally {
      setSearching(false);
    }
  }, []);

  /* ── debounce input → query ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (inputValue.trim() !== query) {
        setQuery(inputValue);
        setOffset(0);
      }
    }, 450);
    return () => clearTimeout(debounceRef.current);
  }, [inputValue]);

  /* ── fire search when dependencies change ── */
  useEffect(() => {
    if (query.trim()) {
      runSearch(query, typeFilter, offset, selectedDoc);
      const p = { q: query };
      if (typeFilter !== "all") p.file_type = typeFilter;
      if (offset > 0) p.offset = String(offset);
      setSearchParams(p, { replace: true });
    }
  }, [query, typeFilter, offset, selectedDoc, runSearch, setSearchParams]);

  /* ── handlers ── */
  const handleSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(inputValue);
    setOffset(0);
  };

  const handleClear = () => {
    setInputValue("");
    setQuery("");
    setResults([]);
    setTotal(0);
    setHasSearched(false);
    setSearchError(null);
    setSearchParams({}, { replace: true });
    searchInputRef.current?.focus();
  };

  const handleTypeFilter = (t) => {
    setTypeFilter(t);
    setOffset(0);
  };

  const handleExampleClick = (ex) => {
    setInputValue(ex);
    setQuery(ex);
    setOffset(0);
    setActiveTab("search");
  };

  const handleAsk = async () => {
    if (!qaQuestion.trim()) return;
    setQaLoading(true);
    setQaError(null);
    setQaResult(null);
    try {
      const data = await askKnowledgeBase(qaQuestion);
      setQaResult(data);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err.message || "Failed to retrieve passages.";
      setQaError(msg);
    } finally {
      setQaLoading(false);
    }
  };

  /* ── pagination ── */
  const showFrom  = total === 0 ? 0 : offset + 1;
  const showTo    = Math.min(offset + LIMIT, total);
  const hasPrev   = offset > 0;
  const hasNext   = offset + LIMIT < total;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  /* ─────────────────────────── render ──────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Top header ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          {/* Tab nav */}
          <div className="flex items-center gap-6 mb-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Knowledge Search</h1>
              <p className="text-xs text-slate-500">Search and retrieve information from your safety documents</p>
            </div>
            <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab("search")}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${
                  activeTab === "search"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Search className="w-3.5 h-3.5 inline mr-1.5" />
                Document Search
              </button>
              <button
                onClick={() => setActiveTab("qa")}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${
                  activeTab === "qa"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
                Knowledge Q&amp;A
              </button>
            </div>
          </div>

          {/* ── Search bar (shown in search tab) ── */}
          {activeTab === "search" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    placeholder="Search safety documents — keywords, phrases, or questions…"
                    className="w-full pl-12 pr-10 py-3 text-sm border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E8630A]/40 focus:border-[#E8630A] transition"
                  />
                  {inputValue && (
                    <button
                      onClick={handleClear}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {searching && (
                    <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E8630A] animate-spin" />
                  )}
                </div>
                <button
                  onClick={handleSearch}
                  disabled={!inputValue.trim() || searching}
                  className="px-5 py-3 bg-[#E8630A] hover:bg-[#c55108] disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Search
                </button>
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* File type filters */}
                <div className="flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  {TYPE_FILTERS.map(t => (
                    <button
                      key={t}
                      onClick={() => handleTypeFilter(t)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                        typeFilter === t
                          ? "bg-[#E8630A] text-white border-[#E8630A]"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      {t === "all" ? "All Types" : t.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Document filter */}
                {docList.length > 0 && (
                  <div className="relative ml-auto">
                    <button
                      onClick={() => setShowDocFilter(v => !v)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition ${
                        selectedDoc
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      {selectedDoc
                        ? (docList.find(d => d.id === selectedDoc)?.original_filename?.substring(0, 20) + "…" || "1 doc")
                        : "All documents"
                      }
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showDocFilter && (
                      <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg min-w-56 py-1 max-h-64 overflow-y-auto">
                        <button
                          onClick={() => { setSelectedDoc(null); setShowDocFilter(false); setOffset(0); }}
                          className={`w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-50 ${!selectedDoc ? "text-[#E8630A] font-semibold" : "text-slate-700"}`}
                        >
                          All documents
                        </button>
                        {docList.map(d => (
                          <button
                            key={d.id}
                            onClick={() => { setSelectedDoc(d.id); setShowDocFilter(false); setOffset(0); }}
                            className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${selectedDoc === d.id ? "text-[#E8630A] font-semibold" : "text-slate-700"}`}
                          >
                            <FileTypeBadge type={d.file_type} />
                            <span className="truncate">{d.original_filename}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Q&A input (shown in qa tab) ── */}
          {activeTab === "qa" && (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-amber-800">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  <strong>Document-based retrieval only.</strong> Passages are sourced directly from your uploaded documents. This system does not use AI generation — no answers are fabricated.
                </span>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={qaQuestion}
                    onChange={e => setQaQuestion(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAsk()}
                    placeholder="Ask a question, e.g. 'What are the PPE requirements for construction workers?'"
                    className="w-full pl-11 pr-4 py-3 text-sm border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E8630A]/40 focus:border-[#E8630A] transition"
                  />
                  {qaLoading && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E8630A] animate-spin" />
                  )}
                </div>
                <button
                  onClick={handleAsk}
                  disabled={qaLoading || !qaQuestion.trim()}
                  className="px-5 py-3 bg-[#E8630A] hover:bg-[#c55108] disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition flex items-center gap-2"
                >
                  {qaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Ask
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* ══════════════ SEARCH TAB ══════════════ */}
        {activeTab === "search" && (
          <div className="space-y-5">
            {/* Error */}
            {searchError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {searchError}
              </div>
            )}

            {/* Pre-search: examples */}
            {!hasSearched && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Left: Intro */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                  <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 mb-1">Search Your Safety Documents</h2>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Search through the extracted text of all your uploaded documents. Results show the exact passage where the information appears, along with the document name and page number.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Search supports</p>
                    {["Single keywords: hardhat", "Phrases: personal protective equipment", "Multi-term: electrical safety inspection", "Questions: What PPE is required?"].map(ex => (
                      <div key={ex} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="text-[#E8630A] font-bold mt-0.5">•</span>
                        {ex}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Example queries */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-bold text-slate-900">Example Searches</h2>
                  </div>
                  <div className="space-y-2">
                    {EXAMPLE_QUERIES.map(ex => (
                      <button
                        key={ex}
                        onClick={() => handleExampleClick(ex)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-amber-50 hover:border-amber-200 text-sm text-slate-700 transition flex items-center gap-2 group"
                      >
                        <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 transition shrink-0" />
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Loading skeleton */}
            {searching && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
                    <div className="flex gap-2 mb-3">
                      <div className="h-4 bg-slate-200 rounded w-48" />
                      <div className="h-4 bg-slate-200 rounded w-12" />
                      <div className="h-4 bg-slate-200 rounded w-16" />
                    </div>
                    <div className="h-3 bg-slate-200 rounded w-full mb-2" />
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {hasSearched && !searching && results.length === 0 && !searchError && query.trim() && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <Search className="w-8 h-8 text-slate-300" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-700 mb-1">No results for "{query}"</p>
                  <p className="text-sm text-slate-400">
                    Try different keywords, broader terms, or check if the relevant document has been uploaded and processed.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {EXAMPLE_QUERIES.slice(0, 3).map(ex => (
                    <button
                      key={ex}
                      onClick={() => handleExampleClick(ex)}
                      className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 hover:bg-amber-100 transition"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {results.length > 0 && !searching && (
              <div className="space-y-4">
                {/* Results header */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Showing <span className="font-semibold text-slate-900">{showFrom}–{showTo}</span> of{" "}
                    <span className="font-semibold text-slate-900">{total}</span> results for{" "}
                    <span className="font-semibold text-[#E8630A]">"{query}"</span>
                    {selectedDoc && (
                      <span className="ml-2 text-slate-400">
                        (in {docList.find(d => d.id === selectedDoc)?.original_filename || "selected document"})
                      </span>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <span className="text-xs text-slate-400">
                      Page {currentPage} of {totalPages}
                    </span>
                  )}
                </div>

                {/* Result cards */}
                <div className="space-y-3">
                  {results.map((result, idx) => (
                    <ResultCard
                      key={`${result.chunk_id}-${idx}`}
                      result={result}
                      query={query}
                      index={idx}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {(hasPrev || hasNext) && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                      disabled={!hasPrev || searching}
                      className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition disabled:opacity-40 shadow-sm"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </button>
                    <span className="text-sm text-slate-500">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setOffset(o => o + LIMIT)}
                      disabled={!hasNext || searching}
                      className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition disabled:opacity-40 shadow-sm"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ Q&A TAB ══════════════ */}
        {activeTab === "qa" && (
          <div className="space-y-5">
            {/* Q&A error */}
            {qaError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {qaError}
              </div>
            )}

            {/* Q&A loading */}
            {qaLoading && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-[#E8630A] animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Searching documents…</p>
                  <p className="text-xs text-slate-400">Retrieving relevant passages from your knowledge base</p>
                </div>
              </div>
            )}

            {/* Q&A result */}
            {qaResult && !qaLoading && (
              <div className="space-y-4">
                {/* Answered question */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#E8630A]/10 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-4 h-4 text-[#E8630A]" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Your Question</p>
                      <p className="text-sm font-semibold text-slate-800">{qaResult.question}</p>
                    </div>
                  </div>
                </div>

                {/* System notice */}
                <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${
                  qaResult.answer_type === "no_evidence"
                    ? "bg-slate-50 border-slate-200 text-slate-600"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{qaResult.message}</span>
                </div>

                {/* Passages */}
                {qaResult.passages && qaResult.passages.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-slate-500" />
                      <h3 className="text-sm font-bold text-slate-800">
                        {qaResult.passages.length} Supporting Passage{qaResult.passages.length !== 1 ? "s" : ""} Found
                      </h3>
                    </div>
                    {qaResult.passages.map((passage, i) => (
                      <PassageCard key={i} passage={passage} index={i} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center gap-4 text-center">
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                      <BookOpen className="w-7 h-7 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-1">No Relevant Passages Found</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Try rephrasing your question with different keywords, or upload documents that cover this topic.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pre-Q&A state */}
            {!qaResult && !qaLoading && !qaError && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 mb-1">Knowledge Q&amp;A</h2>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Ask questions in plain English. The system retrieves the most relevant passages from your uploaded documents to help you find the answer.
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                    <strong>No AI generation:</strong> Results are real text passages from your actual documents.
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-bold text-slate-900">Example Questions</h2>
                  </div>
                  <div className="space-y-2">
                    {[
                      "What are the responsibilities of employees for safety?",
                      "What PPE is required for construction workers?",
                      "How should accidents be reported?",
                      "What corrective actions were identified?",
                      "What are the regulations for electrical work?",
                    ].map(ex => (
                      <button
                        key={ex}
                        onClick={() => setQaQuestion(ex)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-amber-50 hover:border-amber-200 text-sm text-slate-700 transition flex items-center gap-2 group"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 transition shrink-0" />
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
