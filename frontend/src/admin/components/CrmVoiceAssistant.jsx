import { useEffect, useRef, useState } from "react";
import { Headphones, Loader2, Mic, MicOff, Phone, RefreshCw, Send, X } from "lucide-react";
import { adminApi } from "../api";

const greeting = {
  role: "assistant",
  content: "Hi. I can answer questions using CRM summaries and published property data, or draft a follow-up for your review. I never save a change until you confirm it.",
};

export default function CrmVoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [calls, setCalls] = useState([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState("");
  const [messages, setMessages] = useState([greeting]);
  const [draft, setDraft] = useState("");
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognition = useRef(null);
  const bottom = useRef(null);
  const assistantReady = Boolean(status?.assistant_enabled || status?.assistant_test_mode);

  useEffect(() => {
    adminApi.crmVoiceStatus().then(setStatus, (requestError) => setError(requestError.message));
    return () => {
      recognition.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const refreshCalls = async () => {
      setCallsLoading(true);
      try {
        const result = await adminApi.crmVoiceCalls();
        if (active) {
          setCalls(result.items || []);
          setCallsError("");
        }
      } catch (requestError) {
        if (active) setCallsError(requestError.message || "Could not load recent calls.");
      } finally {
        if (active) setCallsLoading(false);
      }
    };
    refreshCalls();
    const timer = window.setInterval(refreshCalls, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, proposal]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const send = async (value) => {
    const text = value.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }].slice(-10);
    setMessages(next);
    setDraft("");
    setError("");
    setProposal(null);
    setBusy(true);
    try {
      const result = await adminApi.crmVoiceAssistant(next.filter((message) => message.role !== "assistant" || message !== greeting));
      const response = { role: "assistant", content: result.reply };
      setMessages((current) => [...current, response].slice(-12));
      setProposal(result.proposal || null);
      if ("speechSynthesis" in window && result.reply) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.reply));
      }
    } catch (requestError) {
      setError(requestError.message || "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  };
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser. You can still type to the assistant.");
      return;
    }
    setError("");
    const current = new SpeechRecognition();
    current.lang = "en-IN";
    current.interimResults = true;
    current.continuous = false;
    let spoken = "";
    current.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) spoken += event.results[index][0].transcript;
        else interim += event.results[index][0].transcript;
      }
      setDraft((spoken + interim).trim());
    };
    current.onerror = (event) => {
      setListening(false);
      setError(event.error === "not-allowed" ? "Allow microphone access in your browser to use voice input." : "Voice input stopped. You can type your question instead.");
    };
    current.onend = () => setListening(false);
    recognition.current = current;
    setListening(true);
    current.start();
  };

  const confirmProposal = async () => {
    if (!proposal || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.confirmCrmVoiceFollowUp(proposal);
      setMessages((current) => [...current, { role: "assistant", content: `Follow-up saved for ${proposal.lead_reference}.` }].slice(-12));
      setProposal(null);
    } catch (requestError) {
      setError(requestError.message || "Could not save the follow-up.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open CRM voice assistant"
        className="fixed bottom-5 right-5 z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-[#142536] px-4 text-sm font-bold text-white shadow-xl transition hover:bg-[#c9a45c] hover:text-[#142536] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9a45c]"
      >
        <Headphones size={19} aria-hidden="true" />
        <span className="hidden sm:inline">AI Voice Agent</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0f1f2e]/45 p-2 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="crm-voice-title" className="flex max-h-[min(760px,95dvh)] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex items-center gap-3 bg-[#142536] px-5 py-4 text-white">
              <span className="grid size-10 place-items-center rounded-xl bg-[#c9a45c] text-[#142536]"><Headphones size={20} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="crm-voice-title" className="font-display text-lg font-bold">CRM Voice Agent</h2>
                <p className="text-xs text-white/70">Staff-only · CRM data · confirmation before changes</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="grid size-9 place-items-center rounded-full hover:bg-white/10"><X size={18} aria-hidden="true" /></button>
            </header>

            <div className="flex flex-wrap gap-2 border-b border-[#e7e2d8] bg-[#fbfaf7] px-4 py-3 text-xs">
              <span className={`rounded-full px-3 py-1 font-semibold ${status?.assistant_enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                CRM assistant {status?.assistant_enabled ? "live" : status?.assistant_test_mode ? "test mode" : "disabled"}
              </span>
              <span className={`rounded-full px-3 py-1 font-semibold ${status?.phone_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                Phone calls {status?.phone_enabled ? "Retell ready" : "Retell setup required"}
              </span>
            </div>

            {status?.assistant_test_mode && (
              <p className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">
                Test mode is active: text, microphone transcription, CRM access and spoken replies can be checked without sending data to OpenAI. Real AI answers need <code>OPENAI_API_KEY</code>.
              </p>
            )}
            {status && !assistantReady && (
              <p className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">
                Enable the assistant in Admin settings to continue. No CRM data is sent to an AI provider while it is disabled.
              </p>
            )}
            {!status?.phone_enabled && status?.phone_missing_settings?.length > 0 && (
              <p className="mx-4 mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-[#4b5966]">
                Live phone calls are disabled. Add these backend secrets to test a real call: <code>{status.phone_missing_settings.join(", ")}</code>. No phone call is simulated or placed without them.
              </p>
            )}

            <section className="border-b border-[#e7e2d8] px-4 py-3" aria-label="Recent AI calls">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-[#142536]"><Phone size={15} aria-hidden="true" /> Recent calls</h3>
                <button type="button" onClick={() => { setCallsError(""); adminApi.crmVoiceCalls().then((result) => setCalls(result.items || []), (requestError) => setCallsError(requestError.message || "Could not load recent calls.")); }} disabled={callsLoading} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#80602b] disabled:opacity-50" aria-label="Refresh call history">
                  <RefreshCw size={13} className={callsLoading ? "animate-spin" : ""} aria-hidden="true" /> Refresh
                </button>
              </div>
              {callsError ? <p role="alert" className="text-xs text-rose-700">{callsError}</p> : calls.length ? (
                <ul className="max-h-36 space-y-2 overflow-y-auto">
                  {calls.slice(0, 8).map((call) => (
                    <li key={call.call_id} className="rounded-xl bg-[#fbfaf7] px-3 py-2 text-xs text-[#536272]">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="font-semibold text-[#142536]">{call.lead_reference || "Unmatched caller"} · {call.direction || "call"}</span>
                        <span className="capitalize">{String(call.status || "unknown").replaceAll("_", " ")}</span>
                      </div>
                      <p className="mt-0.5">{call.created_at ? new Date(call.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Time unavailable"}</p>
                      {call.summary && <p className="mt-1 line-clamp-2 text-[#142536]">{call.summary}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-[#68717a]">{callsLoading ? "Checking for call activity…" : "Call activity appears here automatically."}</p>}
            </section>

            <div className="min-h-40 flex-1 space-y-3 overflow-y-auto bg-[#f7f4ed] px-4 py-4" aria-live="polite">
              {messages.map((message, index) => (
                <p key={`${index}-${message.role}`} className={`w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-[#142536] text-white" : "bg-white text-[#142536] shadow-sm"}`}>
                  {message.content}
                </p>
              ))}
              {proposal && (
                <div className="space-y-2 rounded-2xl border border-[#c9a45c] bg-white p-4 text-sm text-[#142536]">
                  <p className="font-bold">Review follow-up proposal</p>
                  <p>Lead {proposal.lead_reference} · {proposal.lead_name}</p>
                  <p>{proposal.note}</p>
                  <p>{new Date(proposal.next_action_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  <button type="button" onClick={confirmProposal} disabled={busy} className="rounded-full bg-[#142536] px-4 py-2 font-bold text-white disabled:opacity-50">
                    Confirm and save follow-up
                  </button>
                </div>
              )}
              {busy && <p className="flex items-center gap-2 text-sm text-[#5e6872]"><Loader2 size={16} className="animate-spin" /> Working…</p>}
              <div ref={bottom} />
            </div>

            {error && <p role="alert" className="mx-4 mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
            <form onSubmit={(event) => { event.preventDefault(); send(draft); }} className="flex items-center gap-2 border-t border-[#e7e2d8] p-3">
              <button type="button" onClick={listening ? () => recognition.current?.stop() : startListening} disabled={busy} aria-label={listening ? "Stop voice input" : "Start voice input"} title={listening ? "Stop listening" : "Speak"} className={`grid size-11 shrink-0 place-items-center rounded-full ${listening ? "bg-rose-100 text-rose-800" : "bg-[#f3ead8] text-[#142536]"} disabled:opacity-50`}>
                {listening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
              </button>
              <label className="sr-only" htmlFor="crm-voice-input">Ask the CRM assistant</label>
              <input id="crm-voice-input" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder={listening ? "Listening…" : "Ask about leads, follow-ups, properties…"} className="min-w-0 flex-1 rounded-full border border-[#d9dce0] px-4 py-3 text-sm outline-none focus:border-[#c9a45c]" />
              <button type="submit" disabled={!draft.trim() || busy || !assistantReady} aria-label="Send question" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#142536] text-white disabled:opacity-40"><Send size={17} aria-hidden="true" /></button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
