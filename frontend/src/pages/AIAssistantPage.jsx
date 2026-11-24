import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, Send, Loader2, AlertTriangle, FileText,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock,
  Zap, Shield, BookOpen, Camera,
  ArrowRight, RotateCcw, Sparkles,
} from 'lucide-react';
import { ragAsk, runInvestigation } from '../services/api';

// ─── Suggested questions ────────────────────────────────────────────────────
const SUGGESTED_QUESTIONS = [
  { text: 'What are the PPE requirements for construction workers?', icon: Shield, color: 'blue' },
  { text: 'What precautions are required when working at heights?', icon: BookOpen, color: 'purple' },
  { text: 'What should a supervisor do after a PPE violation?', icon: FileText, color: 'emerald' },
  { text: 'Why was there a safety violation alert?', icon: AlertTriangle, color: 'amber' },
  { text: 'What safety violations were recently detected?', icon: Camera, color: 'rose' },
  { text: 'What are the fire safety evacuation procedures?', icon: Zap, color: 'orange' },
];

const COLOR_MAP = {
  amber:   'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
  blue:    'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
  rose:    'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
  purple:  'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
  orange:  'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
};

// ─── Markdown-lite renderer ──────────────────────────────────────────────────
function renderAnswer(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bold heading (e.g. **Sources:**)
    const boldHeadingMatch = line.match(/^\*\*(.*?)\*\*:?\s*$/);
    if (boldHeadingMatch) {
      elements.push(
        <p key={key++} className="font-semibold text-slate-800 mt-3 mb-1">
          {boldHeadingMatch[1]}
        </p>
      );
      continue;
    }

    // Bullet points
    if (line.startsWith('- ')) {
      const content = line.slice(2);
      // Inline bold
      const parts = content.split(/\*\*(.*?)\*\*/g);
      elements.push(
        <li key={key++} className="text-sm text-slate-700 leading-relaxed">
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
        </li>
      );
      continue;
    }

    // Horizontal rule
    if (line.trim() === '---') {
      elements.push(<hr key={key++} className="my-2 border-slate-200" />);
      continue;
    }

    // Empty line — small spacer
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }

    // Regular paragraph with inline bold
    const parts = line.split(/\*\*(.*?)\*\*/g);
    elements.push(
      <p key={key++} className="text-sm text-slate-700 leading-relaxed">
        {parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j}>{part}</strong> : part
        )}
      </p>
    );
  }

  // Wrap consecutive <li> elements in a <ul>
  const wrapped = [];
  let listBuf = [];
  for (const el of elements) {
    if (el.type === 'li') {
      listBuf.push(el);
    } else {
      if (listBuf.length) {
        wrapped.push(
          <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1 my-1 ml-1">
            {listBuf}
          </ul>
        );
        listBuf = [];
      }
      wrapped.push(el);
    }
  }
  if (listBuf.length) {
    wrapped.push(
      <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1 my-1 ml-1">
        {listBuf}
      </ul>
    );
  }

  return wrapped;
}

// ─── Quick Answer bubble ─────────────────────────────────────────────────────
function QuickAnswerBubble({ result }) {
  const noInfo =
    result.answer &&
    result.answer.startsWith("I couldn't find sufficient information");

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Answer card */}
      <div className={`rounded-xl border p-4 ${noInfo ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
        {noInfo ? (
          <p className="text-sm text-amber-700 italic">{result.answer}</p>
        ) : (
          <div className="space-y-1">
            {renderAnswer(result.answer)}
          </div>
        )}
      </div>

      {/* Source links (only when answer has content and sources exist) */}
      {!noInfo && result.sources && result.sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.sources
            .filter(s => s.type === 'document')
            .map((s, i) => (
              <Link
                key={i}
                to={`/documents/${s.document_id}${s.page_number ? `?page=${s.page_number}` : ''}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
              >
                <FileText className="w-3 h-3" />
                {s.document_name}
                {s.page_number && <span className="text-blue-500">· p.{s.page_number}</span>}
              </Link>
            ))}
        </div>
      )}

      {/* Powered-by indicator */}
      {result.llm_used && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Answer generated by Gemini AI using your uploaded documents only.
        </p>
      )}
    </div>
  );
}

// ─── Full Investigation helpers ──────────────────────────────────────────────
function StepIcon({ status }) {
  if (status === 'completed' || status === 'sent' || status === 'dev_mode')
    return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === 'failed')
    return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  if (status === 'skipped' || status === 'no_results' || status === 'no_evidence')
    return <Clock className="w-4 h-4 text-slate-400 shrink-0" />;
  return <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />;
}

function WorkflowTimeline({ steps }) {
  const [expanded, setExpanded] = useState(false);
  if (!steps || steps.length === 0) return null;
  const displaySteps = expanded ? steps : steps.slice(0, 3);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-500" />
          Investigation Workflow ({steps.length} steps)
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <div className="px-4 pb-3 space-y-2">
        {displaySteps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-0.5">
              <StepIcon status={step.status} />
              {i < displaySteps.length - 1 && <div className="w-px h-4 bg-slate-200 mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <p className="text-sm font-medium text-slate-700">{step.name}</p>
              {step.detail && <p className="text-xs text-slate-500 truncate">{step.detail}</p>}
            </div>
          </div>
        ))}
        {!expanded && steps.length > 3 && (
          <button onClick={() => setExpanded(true)} className="text-xs text-blue-600 hover:underline ml-7">
            + {steps.length - 3} more steps
          </button>
        )}
      </div>
    </div>
  );
}

// Full Investigation bubble (keeps the existing rich display)
function InvestigationBubble({ result }) {
  const steps = result.steps || result.workflow_steps || [];
  const incidentCreated = result.incident_created || result.incident_id;

  const badgeColor =
    result.answer_type === 'llm_grounded'   ? 'bg-emerald-100 text-emerald-700' :
    result.answer_type === 'retrieval_only' ? 'bg-blue-100 text-blue-700' :
    'bg-slate-100 text-slate-500';

  const badgeText =
    result.answer_type === 'llm_grounded'   ? 'AI-grounded answer' :
    result.answer_type === 'retrieval_only' ? 'Evidence retrieved' :
    'No evidence found';

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>
          <Bot className="w-3 h-3" />
          {badgeText}
        </span>
        {result.llm_used && <span className="text-xs text-slate-400">Powered by Gemini</span>}
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

      {/* Answer text */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {result.answer_type === 'no_evidence' ? (
          <p className="text-sm text-slate-500 italic">{result.answer}</p>
        ) : (
          <div className="space-y-1">
            {renderAnswer(result.answer)}
          </div>
        )}
      </div>

      {/* Workflow steps */}
      <WorkflowTimeline steps={steps} />

      {/* Disclaimer */}
      {result.answer_type !== 'no_evidence' && (
        <p className="text-[11px] text-slate-400 italic">
          Evidence retrieved from your uploaded documents and detection records.
          {result.llm_used
            ? ' Investigation summary generated by Gemini AI using retrieved evidence only.'
            : ' No AI generation used — evidence shown from your documents.'}
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
          {msg.isInvestigation
            ? <InvestigationBubble result={msg.result} />
            : <QuickAnswerBubble result={msg.result} />}
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
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [mode, setMode]           = useState('rag'); // 'rag' | 'investigate'
  const messagesEndRef            = useRef(null);
  const inputRef                  = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div className="flex flex-col h-[calc(100vh-64px-64px)] gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Safety Assistant</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Ask questions about your safety documents and PPE requirements
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
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
      </div>

      {/* Mode description */}
      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        {mode === 'rag' ? (
          <span>
            <strong>Quick Answer</strong>: Searches your uploaded safety documents and returns a
            direct answer with document references. No incident logging.
          </span>
        ) : (
          <span>
            <strong>Full Investigation</strong>: Runs the complete workflow — retrieves visual
            detections, searches safety documents, generates a summary, logs incidents, and prepares alerts.
          </span>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 space-y-6 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-6 py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-white shadow-lg">
              <Bot className="w-8 h-8" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-xl font-bold text-slate-800">SafeVision AI Assistant</h2>
              <p className="text-sm text-slate-500 mt-2">
                {mode === 'rag'
                  ? 'Ask me about safety requirements, PPE rules, or procedures. I will search your uploaded documents and give you a direct answer.'
                  : 'Ask me about PPE violations or safety incidents. I will search documents and detection records, then log an incident.'}
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
                      : 'Searching your documents…'}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
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
              mode === 'rag'
                ? 'Ask a safety question… (e.g. "What PPE is required for welding?")'
                : 'Ask an investigation question… (e.g. "Why was there a safety violation?")'
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
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
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

      <style>{`
        mark { background: #fef08a; color: #1e293b; border-radius: 2px; padding: 0 1px; }
      `}</style>
    </div>
  );
}
