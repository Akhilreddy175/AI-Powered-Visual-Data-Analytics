import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Download, RefreshCw, FileText, AlertCircle,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Loader2, Search, AlertTriangle, Info
} from "lucide-react";
import {
  getDocument, getDocumentText, getExtractedInfo,
  reprocessDocument, getDocumentDownloadUrl
} from "../services/api";
import DocStatusBadge from "../components/DocStatusBadge";

/* ── helpers ─────────────────────────────────────────── */
function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleString() : "—";
}
function FileTypePill({ type }) {
  const map = {
    pdf:  "bg-rose-50 text-rose-600 border-rose-200",
    docx: "bg-blue-50 text-blue-600 border-blue-200",
    txt:  "bg-slate-100 text-slate-600 border-slate-200",
  };
  const k = (type || "").toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border uppercase ${map[k] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {type || "—"}
    </span>
  );
}
function ConfidenceDot({ score }) {
  let colour = "bg-slate-300", label = "";
  if (typeof score === "string") {
    if (score === "high")   { colour = "bg-emerald-500"; label = "high"; }
    else if (score === "medium") { colour = "bg-amber-400"; label = "med"; }
    else if (score === "low")    { colour = "bg-rose-400";  label = "low"; }
    else label = score;
  } else if (typeof score === "number") {
    const pct = Math.round(score * 100);
    colour = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
    label  = `${pct}%`;
  }
  return (
    <span className="flex items-center gap-1 shrink-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${colour}`} />
      {label && <span className="text-[10px] text-slate-400 font-medium">{label}</span>}
    </span>
  );
}

const FACT_LABELS = {
  document_title:    "Document Title",
  inspection_date:   "Inspection Date",
  location:          "Location",
  hazard:            "Identified Hazards",
  ppe_requirement:   "PPE Requirements",
  corrective_action: "Corrective Actions",
  recommendation:    "Recommendations",
  responsible_party: "Responsible Parties",
  deadline:          "Deadlines",
  safety_procedure:  "Safety Procedures",
  precaution:        "Precautions",
};
const FACT_COLORS = {
  hazard:            "text-rose-600 bg-rose-50 border-rose-200",
  ppe_requirement:   "text-amber-700 bg-amber-50 border-amber-200",
  corrective_action: "text-blue-700 bg-blue-50 border-blue-200",
  precaution:        "text-orange-700 bg-orange-50 border-orange-200",
};

/* ── Extracted Facts accordion ───────────────────────── */
function FactsPanel({ docId }) {
  const [grouped, setGrouped]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [open, setOpen]         = useState({});
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getExtractedInfo(docId)
      .then(data => {
        if (cancelled) return;
        // API returns { facts: { fact_type: [...] } } — already grouped
        const raw = data.facts;
        if (!raw || typeof raw !== "object") { setGrouped({}); }
        else if (Array.isArray(raw)) {
          // Fallback: flat array
          const g = raw.reduce((acc, f) => {
            const k = f.fact_type || "other";
            if (!acc[k]) acc[k] = [];
            acc[k].push(f);
            return acc;
          }, {});
          setGrouped(g);
        } else {
          setGrouped(raw);
        }
        setLoading(false);
      })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [docId]);

  if (loading) return (
    <div className="space-y-2 animate-pulse">
      {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-200 rounded-lg" />)}
    </div>
  );
  if (error) return <p className="text-xs text-rose-500 py-2">{error}</p>;

  const entries = grouped ? Object.entries(grouped).filter(([, items]) => items?.length > 0) : [];
  if (!entries.length) return (
    <div className="flex flex-col items-center py-6 text-center gap-2">
      <Info className="w-6 h-6 text-slate-300" />
      <p className="text-xs text-slate-400">No structured facts were extracted from this document.</p>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {entries.map(([group, items]) => {
        const colorClass = FACT_COLORS[group] || "text-slate-700 bg-slate-50 border-slate-200";
        return (
          <div key={group} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(p => ({ ...p, [group]: !p[group] }))}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colorClass}`}>
                  {FACT_LABELS[group] || group.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-slate-400 font-medium">{items.length}</span>
              </div>
              {open[group] ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                           : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </button>

            {open[group] && (
              <ul className="divide-y divide-slate-100">
                {items.map((fact, fi) => {
                  const key = fact.id ?? `${group}-${fi}`;
                  return (
                    <li key={key} className="px-3.5 py-3 bg-white">
                      <div className="flex items-start gap-2">
                        <p className="text-sm text-slate-800 leading-snug flex-1">{fact.value}</p>
                        {fact.confidence && <ConfidenceDot score={fact.confidence} />}
                      </div>
                      {fact.page_number != null && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Page {fact.page_number}</p>
                      )}
                      {fact.source_text && (
                        <>
                          <button
                            onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
                            className="mt-1.5 text-[11px] text-amber-600 hover:text-amber-700 font-semibold"
                          >
                            {expanded[key] ? "Hide source ▲" : "Show source ▼"}
                          </button>
                          {expanded[key] && (
                            <blockquote className="mt-1.5 text-xs text-slate-500 italic bg-amber-50 border-l-2 border-amber-300 pl-3 pr-2 py-2 rounded-r-lg leading-relaxed">
                              &ldquo;{fact.source_text}&rdquo;
                            </blockquote>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── highlight helper ────────────────────────────────── */
function highlightText(text, query) {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts   = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-amber-200 text-amber-900 rounded-sm px-0.5">{part}</mark>
      : part
  );
}

/* ── main component ──────────────────────────────────── */
const PER_PAGE = 10;

export default function DocumentDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  // If navigated from a search result, highlight the target chunk/page
  const targetChunkId = searchParams.get("chunk") ? parseInt(searchParams.get("chunk"), 10) : null;
  const targetPage    = searchParams.get("page")  ? parseInt(searchParams.get("page"), 10)  : null;

  const [doc,         setDoc]         = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const [chunks,      setChunks]      = useState([]);
  const [chunkTotal,  setChunkTotal]  = useState(0);
  const [chunkOffset, setChunkOffset] = useState(0);
  const [chunksLoading, setChunksLoading] = useState(false);

  const [filterText, setFilterText]   = useState("");
  const [reprocessing, setReprocessing] = useState(false);

  // Track if we've scrolled to the target chunk
  const highlightedRef = useRef(null);
  const didScrollRef   = useRef(false);

  /* fetch document metadata */
  const fetchDoc = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setDoc(await getDocument(id));
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load document.");
    } finally { setLoading(false); }
  }, [id]);

  /* fetch text chunks */
  const fetchChunks = useCallback(async () => {
    setChunksLoading(true);
    try {
      const data = await getDocumentText(id, { limit: PER_PAGE, offset: chunkOffset });
      setChunks(data.chunks ?? []);
      setChunkTotal(data.total ?? 0);
    } catch (_) { /* non-fatal */ } finally { setChunksLoading(false); }
  }, [id, chunkOffset]);

  useEffect(() => { fetchDoc(); },    [fetchDoc]);
  useEffect(() => { fetchChunks(); }, [fetchChunks]);

  // If a targetChunkId is specified (from search result link), find which page it is on
  // and jump to that offset
  useEffect(() => {
    if ((targetChunkId || targetPage) && chunks.length > 0 && !didScrollRef.current) {
      // Try to scroll to the highlighted chunk
      setTimeout(() => {
        if (highlightedRef.current) {
          highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
          didScrollRef.current = true;
        }
      }, 200);
    }
  }, [chunks, targetChunkId, targetPage]);

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await reprocessDocument(id);
      await fetchDoc();
      setChunkOffset(0);
      await fetchChunks();
    } catch (_) {} finally { setReprocessing(false); }
  };

  const chunkPages = Math.ceil(chunkTotal / PER_PAGE);
  const currentPage = Math.floor(chunkOffset / PER_PAGE) + 1;

  const filteredChunks = useMemo(() => {
    if (!filterText.trim()) return chunks;
    const q = filterText.toLowerCase();
    return chunks.filter(c => c.text?.toLowerCase().includes(q));
  }, [chunks, filterText]);

  /* ── loading skeleton ── */
  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-5 bg-slate-200 rounded w-40" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="h-52 bg-slate-200 rounded-xl" />
          <div className="h-40 bg-slate-200 rounded-xl" />
        </div>
        <div className="lg:col-span-2 space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
        </div>
      </div>
    </div>
  );

  /* ── error state ── */
  if (error) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 max-w-md w-full text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="font-semibold text-rose-700">{error}</p>
        <button onClick={fetchDoc} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── actions bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/documents" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Documents
        </Link>
        <div className="flex-1" />
        <a
          href={getDocumentDownloadUrl(id)}
          download
          className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" /> Download
        </a>
        <button
          onClick={handleReprocess}
          disabled={reprocessing}
          className="flex items-center gap-2 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {reprocessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {reprocessing ? "Reprocessing…" : "Reprocess"}
        </button>
      </div>

      {/* ── two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ─── left column ─── */}
        <div className="space-y-4">

          {/* Metadata card */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-slate-800 break-words leading-snug">{doc?.original_filename}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <FileTypePill type={doc?.file_type} />
                  <DocStatusBadge status={doc?.status} />
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm border-t border-slate-100 pt-4">
              {[
                ["File Size",  fmtSize(doc?.file_size_bytes)],
                ["Pages",      doc?.page_count ?? "—"],
                ["Words",      doc?.word_count?.toLocaleString() ?? "—"],
                ["Characters", doc?.char_count?.toLocaleString() ?? "—"],
                ["Chunks",     doc?.chunk_count ?? "—"],
                ["Facts",      doc?.fact_count ?? "—"],
                ["Processed",  fmtDate(doc?.processed_at)],
              ].map(([label, val]) => (
                <div key={label}>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                  <dd className="text-slate-800 font-semibold text-sm mt-0.5 break-words">{val}</dd>
                </div>
              ))}
            </dl>

            {doc?.extraction_warnings && (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-amber-700 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>{doc.extraction_warnings}</p>
              </div>
            )}
            {doc?.processing_error && (
              <div className="flex gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-rose-700 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p><span className="font-bold">Error: </span>{doc.processing_error}</p>
              </div>
            )}
          </div>

          {/* Extracted Facts */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Extracted Facts</p>
            <FactsPanel docId={id} />
          </div>
        </div>

        {/* ─── right column — text chunks ─── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs">
            {/* header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Document Content
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {chunkTotal} chunks · page {currentPage} of {chunkPages || 1}
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter chunks…"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 w-48"
                />
              </div>
            </div>

            {/* chunk list */}
            <div className="divide-y divide-slate-100">
              {chunksLoading ? (
                <div className="p-5 space-y-4 animate-pulse">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}
                </div>
              ) : filteredChunks.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3 text-center">
                  <FileText className="w-8 h-8 text-slate-300" />
                  <p className="text-slate-500 text-sm font-medium">
                    {filterText ? `No chunks match "${filterText}"` : "No content extracted yet"}
                  </p>
                  {!filterText && (
                    <p className="text-xs text-slate-400">Try reprocessing the document</p>
                  )}
                </div>
              ) : (
              filteredChunks.map((chunk, idx) => {
                  const isTarget = (targetChunkId && chunk.id === targetChunkId) ||
                                   (targetPage && chunk.page_number === targetPage);
                  return (
                  <div
                    key={chunk.id ?? idx}
                    ref={isTarget ? highlightedRef : null}
                    className={`px-5 py-4 hover:bg-slate-50/60 transition-colors ${
                      isTarget ? "bg-amber-50 border-l-4 border-l-amber-500" : ""
                    }`}
                  >
                    {/* chunk header */}
                    <div className="flex flex-wrap items-center gap-2 mb-2.5">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        chunk.page_number != null
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {chunk.page_number != null ? `Page ${chunk.page_number}` : "No page ref"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Chunk #{(chunk.chunk_index ?? idx) + 1}
                      </span>
                      {chunk.word_count && (
                        <span className="text-[10px] text-slate-400">{chunk.word_count} words</span>
                      )}
                      {isTarget && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                          ← Search result
                        </span>
                      )}
                    </div>

                    {/* section heading */}
                    {chunk.section_heading && (
                      <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                        {chunk.section_heading}
                      </p>
                    )}

                    {/* chunk text */}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {highlightText(chunk.text, filterText.trim())}
                    </p>
                  </div>
                  );
                })
              )}
            </div>

            {/* pagination */}
            {chunkPages > 1 && !filterText && (
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                <span className="text-xs text-slate-500">Page {currentPage} of {chunkPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChunkOffset(o => Math.max(0, o - PER_PAGE))}
                    disabled={chunkOffset === 0 || chunksLoading}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <button
                    onClick={() => setChunkOffset(o => Math.min((chunkPages - 1) * PER_PAGE, o + PER_PAGE))}
                    disabled={currentPage >= chunkPages || chunksLoading}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
