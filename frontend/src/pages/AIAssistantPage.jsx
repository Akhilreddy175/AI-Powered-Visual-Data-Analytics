import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, Send, Loader2, AlertTriangle, FileText, Video, Image,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock,
  Eye, Zap, Database, Cpu, Shield, BookOpen, Camera,
  ArrowRight, RotateCcw, Info,
} from 'lucide-react';
import { ragAsk, runInvestigation, getDetectionSummary } from '../services/api';

// ─── Suggested questions ────────────────────────────────────────────────────
const SUGGESTED_QUESTIONS = [
  { text: 'Why was there a safety violation alert?', icon: AlertTriangle, color: 'amber' },
  { text: 'What are the PPE requirements for construction workers?', icon: Shield, color: 'blue' },
  { text: 'What safety violations were recently detected?', icon: Camera, color: 'rose' },
  { text: 'What precautions are required when working at heights?', icon: BookOpen, color: 'purple' },
  { text: 'Which safety rule applies to the latest helmet violation?', icon: FileText, color: 'emerald' },
  { text: 'What should a supervisor do after a PPE violation?', icon: Zap, color: 'orange' },
];

const COLOR_MAP = {
  amber: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
  blue: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
  rose: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
  purple: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
  orange: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
};

// ─── Workflow step status icons ──────────────────────────────────────────────
function StepIcon({ status }) {
  if (status === 'completed' || status === 'sent' || status === 'dev_mode') {
    return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  }
  if (status === 'failed') {
    return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  }
  if (status === 'skipped' || status === 'no_results' || status === 'no_evidence') {
    return <Clock className="w-4 h-4 text-slate-400 shrink-0" />;
  }
  return <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />;
}

// ─── Workflow timeline ───────────────────────────────────────────────────────
function WorkflowTimeline({ steps }) {
  const [expanded, setExpanded] = useState(false);
  if (!steps || steps.length === 0) return null;

  const displaySteps = expanded ? steps : steps.slice(0, 3);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-500" />
          Investigation Workflow ({steps.length} steps)
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <div className="px-4 pb-3 space-y-2">
        {displaySteps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            {/* connector line */}
            <div className="flex flex-col items-center mt-0.5">
              <StepIcon status={step.status} />
              {i < displaySteps.length - 1 && (
                <div className="w-px h-4 bg-slate-200 mt-1" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <p className="text-sm font-medium text-slate-700">{step.name}</p>
              {step.detail && (
                <p className="text-xs text-slate-500 truncate">{step.detail}</p>
              )}
            </div>
          </div>
        ))}
        {!expanded && steps.length > 3 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-blue-600 hover:underline ml-7"
          >
            + {steps.length - 3} more steps
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Visual evidence card ────────────────────────────────────────────────────
function VisualEvidenceCard({ evidence }) {
  if (!evidence || evidence.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
      <h4 className="text-sm font-semibold text-rose-700 mb-3 flex items-center gap-2">
        <Camera className="w-4 h-4" />
        Visual Detection Evidence
      </h4>
      <div className="space-y-2">
        {evidence.map((ve, i) => (
          <div key={i} className="bg-white rounded-lg border border-rose-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-xs font-bold">
                    <AlertTriangle className="w-3 h-3" />
                    {ve.class_label}
                  </span>
                  <span className="text-xs text-slate-500">
                    Confidence: {(ve.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  File: <span className="font-medium">{ve.analysis_filename}</span>
                </p>
                {ve.media_type === 'video' && ve.timestamp_seconds != null && (
                  <p className="text-xs text-slate-500">
                    Timestamp: {ve.timestamp_seconds.toFixed(1)}s
                    {ve.frame_number != null && ` · Frame ${ve.frame_number}`}
                  </p>
                )}
                {ve.created_at && (
                  <p className="text-xs text-slate-400">
                    Recorded: {new Date(ve.created_at).toLocaleString()}
                  </p>
                )}
              </div>
              <Link
                to={`/history/${ve.analysis_id}`}
                className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
              >
                <Eye className="w-3 h-3" />
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Document evidence card ──────────────────────────────────────────────────
function DocumentEvidenceCard({ evidence }) {
  if (!evidence || evidence.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
      <h4 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
        <FileText className="w-4 h-4" />
        Applicable Safety Rules
      </h4>
      <div className="space-y-3">
        {evidence.map((p, i) => (
          <div key={i} className="bg-white rounded-lg border border-blue-100 p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700">{p.document_name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {p.page_number && (
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                      Page {p.page_number}
                    </span>
                  )}
                  {p.section_heading && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium truncate max-w-[200px]">
                      {p.section_heading}
                    </span>
                  )}
                </div>
              </div>
              <Link
                to={`/documents/${p.document_id}?chunk=${p.chunk_id}&page=${p.page_number || ''}`}
                className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
              >
                <Eye className="w-3 h-3" />
                View
              </Link>
            </div>
            {/* Snippet with highlighted keywords */}
            {p.snippet ? (
              <p
                className="text-xs text-slate-600 leading-relaxed line-clamp-4"
                dangerouslySetInnerHTML={{ __html: p.snippet }}
              />
            ) : p.text ? (
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{p.text}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Answer message bubble ───────────────────────────────────────────────────
function AnswerBubble({ result, isInvestigation }) {
  const [showDetails, setShowDetails] = useState(false);

  const badgeColor =
    result.answer_type === 'llm_grounded' ? 'bg-emerald-100 text-emerald-700' :
    result.answer_type === 'retrieval_only' ? 'bg-blue-100 text-blue-700' :
    'bg-slate-100 text-slate-500';

  const badgeText =
    result.answer_type === 'llm_grounded' ? 'AI-grounded answer' :
    result.answer_type === 'retrieval_only' ? 'Retrieved passages' :
    'No evidence found';

  const steps = result.steps || result.workflow_steps || [];
  const incidentCreated = result.incident_created || result.incident_id;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Answer type badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>
          <Bot className="w-3 h-3" />
          {badgeText}
        </span>
        {result.llm_used && (
          <span className="text-xs text-slate-400">Powered by Gemini</span>
        )}
        {!result.llm_used && result.answer_type === 'retrieval_only' && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Configure GEMINI_API_KEY for AI summaries
          </span>
        )}
        {incidentCreated && (
          <Link
            to={`/incidents${result.incident_id ? '/' + result.incident_id : ''}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold hover:bg-amber-200"
          >
            Incident #{result.incident_id} logged
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Main answer text */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {result.answer_type === 'no_evidence' ? (
          <p className="text-sm text-slate-500 italic">{result.answer}</p>
        ) : (
          <div
            className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: (result.answer || '')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n\n/g, '</p><p class="mt-2">')
                .replace(/\n/g, '<br/>')
            }}
          />
        )}
      </div>

      {/* Evidence cards side by side on larger screens */}
      {(result.visual_evidence?.length > 0 || result.document_evidence?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <VisualEvidenceCard evidence={result.visual_evidence} />
          <DocumentEvidenceCard evidence={result.document_evidence} />
        </div>
      )}

      {/* Workflow timeline (investigation mode only) */}
      {isInvestigation && <WorkflowTimeline steps={steps} />}

      {/* Disclaimer */}
      {result.answer_type !== 'no_evidence' && (
        <p className="text-[11px] text-slate-400 italic">
          All evidence is retrieved from your uploaded documents and detection records.
          {result.llm_used
            ? ' The investigation summary was generated by Gemini AI using retrieved evidence only.'
            : ' No AI generation was used — passages are shown verbatim from your documents.'}
        </p>
      )}
    </div>
  );
}

// ─── Message component ───────────────────────────────────────────────────────
function Message({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.role === 'assistant') {
    return (
      <div className="flex items-start gap-3 w-full">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-sm">
          <Bot className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <AnswerBubble result={msg.result} isInvestigation={msg.isInvestigation} />
        </div>
      </div>
    );
  }

  if (msg.role === 'error') {
    return (
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
          <XCircle className="w-4 h-4 text-rose-500" />
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          {msg.content}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AIAssistantPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('investigate'); // 'rag' | 'investigate'
  const [detectionSummary, setDetectionSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    getDetectionSummary()
      .then(data => setDetectionSummary(data))
      .catch(() => setDetectionSummary(null))
      .finally(() => setLoadingSummary(false));
  }, []);

  const sendQuestion = async (question) => {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      let result;
      if (mode === 'investigate') {
        result = await runInvestigation(q);
      } else {
        result = await ragAsk(q);
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        result,
        isInvestigation: mode === 'investigate',
      }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to get a response. Please try again.';
      setMessages(prev => [...prev, { role: 'error', content: msg }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendQuestion(input);
  };

  const totalViolations = detectionSummary?.analyses?.reduce(
    (sum, a) => sum + (a.violation_count || 0), 0
  ) || 0;

  return (
    <div className="flex flex-col h-[calc(100vh-64px-64px)] gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Safety Investigator</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ask questions about PPE violations and safety documents
          </p>
        </div>

        {/* Context cards */}
        {!loadingSummary && (
          <div className="flex items-center gap-3 flex-wrap">
            {detectionSummary?.analyses?.length > 0 && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                <Camera className="w-4 h-4 text-rose-500" />
                <div>
                  <p className="text-xs font-semibold text-rose-700">{totalViolations} violations</p>
                  <p className="text-[10px] text-rose-500">available as evidence</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
              <Database className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-xs font-semibold text-blue-700">Document Knowledge Base</p>
                <p className="text-[10px] text-blue-500">safety documents indexed</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setMode('investigate')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === 'investigate'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Zap className="w-4 h-4" />
          Full Investigation
        </button>
        <button
          onClick={() => setMode('rag')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === 'rag'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Bot className="w-4 h-4" />
          Quick Answer
        </button>
      </div>

      {/* Mode description */}
      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        {mode === 'investigate' ? (
          <span>
            <strong>Full Investigation</strong>: Runs the complete LangGraph workflow — retrieves visual detections,
            searches safety documents, generates an investigation summary, logs incidents, and prepares alerts.
          </span>
        ) : (
          <span>
            <strong>Quick Answer</strong>: Combines document retrieval with visual detections to answer your question
            directly. Faster than full investigation, no incident logging.
          </span>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 space-y-6 min-h-0">
        {messages.length === 0 ? (
          /* Empty state with suggested questions */
          <div className="h-full flex flex-col items-center justify-center gap-6 py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white shadow-lg">
              <Bot className="w-8 h-8" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-xl font-bold text-slate-800">SafeVision AI Investigator</h2>
              <p className="text-sm text-slate-500 mt-2">
                Ask me about PPE violations, safety requirements, or workplace incidents.
                I'll search your uploaded documents and detection records to provide evidence-based answers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {SUGGESTED_QUESTIONS.map((sq, i) => {
                const Icon = sq.icon;
                return (
                  <button
                    key={i}
                    onClick={() => sendQuestion(sq.text)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-colors ${COLOR_MAP[sq.color]}`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{sq.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Messages */
          <>
            {messages.map((msg, i) => (
              <Message key={i} msg={msg} />
            ))}
            {loading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm text-slate-500">
                    {mode === 'investigate'
                      ? 'Running investigation workflow…'
                      : 'Searching documents and detections…'}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendQuestion(input);
              }
            }}
            placeholder={
              mode === 'investigate'
                ? 'Ask an investigation question... (e.g. "Why was there a safety violation?")'
                : 'Ask a quick safety question...'
            }
            rows={1}
            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            disabled={loading}
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shrink-0"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>

      {messages.length > 0 && (
        <button
          onClick={() => setMessages([])}
          className="text-xs text-slate-400 hover:text-slate-600 text-center transition-colors"
        >
          Clear conversation
        </button>
      )}

      {/* Global mark styles for highlighted snippets */}
      <style>{`
        mark { background: #fef08a; color: #1e293b; border-radius: 2px; padding: 0 1px; }
      `}</style>
    </div>
  );
}
