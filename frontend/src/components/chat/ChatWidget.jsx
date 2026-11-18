import { ArrowUpRight, MessageSquareText, Mic, MicOff, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { answer, GREETING, QUICK_REPLIES } from "./supportBot";
import { apiRequest } from "../../services/apiClient";

// AI answers (OpenAI) when the backend has them switched on; otherwise the
// built-in answers in supportBot.js. Checked once per page load.
let aiStatus = null;
const aiEnabled = () =>
  (aiStatus = aiStatus ?? apiRequest("/chat/status").then((s) => Boolean(s?.enabled), () => false));

// Short pause so replies feel conversational; answers are computed instantly.
const REPLY_DELAY_MS = 350;

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("en-IN");
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [messages, setMessages] = useState([
    { from: "bot", ...GREETING, quick: QUICK_REPLIES },
  ]);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) return undefined;
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    return undefined;
  }, [open]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  const speak = (text) => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setVoiceNotice("Spoken replies are not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const reply = new window.SpeechSynthesisUtterance(text);
    reply.lang = voiceLanguage;
    window.speechSynthesis.speak(reply);
  };

  const send = async (text, { speakReply = false } = {}) => {
    const question = text.trim();
    if (!question || typing) return;
    const history = [...messages, { from: "user", text: question }];
    setMessages(history);
    setInput("");
    setTyping(true);
    if (await aiEnabled()) {
      try {
        const { reply } = await apiRequest("/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: history
              .filter((m) => m.text)
              .slice(-10)
              .map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: String(m.text).slice(0, 1000) })),
          }),
        });
        // Keep the built-in quick links (projects, booking) under the AI reply.
        const builtIn = answer(question);
        setMessages((current) => [...current, { from: "bot", ...builtIn, text: reply, ai: true }]);
        setTyping(false);
        if (speakReply) speak(reply);
        return;
      } catch {
        // Fall through to the built-in answers.
      }
    }
    window.setTimeout(() => {
      const fallback = answer(question, voiceLanguage);
      setMessages((current) => [...current, { from: "bot", ...fallback }]);
      setTyping(false);
      if (speakReply) speak(fallback.text);
    }, REPLY_DELAY_MS);
  };

  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("Voice input is not supported in this browser. You can type your question instead.");
      return;
    }
    setVoiceNotice("");
    const recognition = new Recognition();
    recognition.lang = voiceLanguage;
    recognition.interimResults = true;
    recognition.continuous = false;
    let submitted = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      setInput(transcript);
      const finalTranscript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (finalTranscript && !submitted) {
        submitted = true;
        setVoiceNotice("");
        send(finalTranscript, { speakReply: true });
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        setVoiceNotice("Voice input could not start. Check your microphone permission or type your question.");
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setVoiceNotice("Voice input could not start. Check your microphone permission or type your question.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="support-chat"
        aria-label={open ? "Close chat" : "Chat with Gratia Estates"}
        className="fixed bottom-[10.25rem] right-5 z-40 grid size-14 place-items-center rounded-full bg-[#c9a45c] text-[#142536] shadow-[0_10px_24px_rgba(201,164,92,.45)] transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9a45c]"
      >
        {open ? <X size={24} aria-hidden="true" /> : <MessageSquareText size={24} aria-hidden="true" />}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
        )}
      </button>

      {open && (
        <section
          id="support-chat"
          role="dialog"
          aria-label="Gratia Estates support chat"
          className="fixed inset-x-3 bottom-3 z-[70] flex max-h-[min(640px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-3xl border border-[#e7e2d8] bg-white shadow-[0_30px_80px_rgba(13,27,42,.35)] sm:inset-x-auto sm:bottom-6 sm:right-24 sm:w-[400px]"
        >
          <header className="flex items-center gap-3 bg-gradient-to-br from-[#0d1b2a] via-[#142536] to-[#24405a] px-5 py-4 text-white">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-[#c9a45c] font-display text-lg font-extrabold text-[#142536]">
              G
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#142536] bg-emerald-400" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Gratia Estates Assistant</span>
              <span className="text-xs text-white/70">Instant answers · Advisors on WhatsApp</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="grid size-9 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <X size={19} aria-hidden="true" />
            </button>
          </header>

          <div
            ref={listRef}
            className="flex-1 space-y-4 overflow-y-auto bg-[#f7f4ed] px-4 py-5"
            aria-live="polite"
          >
            {messages.map((message, index) =>
              message.from === "user" ? (
                <p
                  key={index}
                  className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#142536] px-4 py-2.5 text-sm leading-6 text-white"
                >
                  {message.text}
                </p>
              ) : (
                <BotMessage
                  key={index}
                  message={message}
                  onQuick={send}
                  onNavigate={() => setOpen(false)}
                  showQuick={index === messages.length - 1 && !typing}
                />
              ),
            )}
            {typing && (
              <p className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm" aria-label="Assistant is typing">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-2 animate-bounce rounded-full bg-[#c9a45c]"
                    style={{ animationDelay: `${dot * 120}ms` }}
                  />
                ))}
              </p>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-[#e7e2d8] bg-white p-3"
          >
            <label htmlFor="support-chat-language" className="sr-only">Voice language</label>
            <select
              id="support-chat-language"
              value={voiceLanguage}
              onChange={(event) => setVoiceLanguage(event.target.value)}
              className="h-10 max-w-20 rounded-full border border-[#d9dce0] bg-white px-2 text-xs font-semibold text-[#142536] outline-none focus:border-[#c9a45c]"
            >
              <option value="en-IN">EN</option>
              <option value="hi-IN">हिन्दी</option>
            </select>
            <button
              type="button"
              onClick={() => (listening ? recognitionRef.current?.stop() : startListening())}
              aria-label={listening ? "Stop voice input" : "Ask by voice"}
              title={listening ? "Stop listening" : "Ask by voice"}
              className={`grid size-10 shrink-0 place-items-center rounded-full ${listening ? "bg-rose-100 text-rose-800" : "bg-[#f3ead8] text-[#142536]"}`}
            >
              {listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
            </button>
            <label htmlFor="support-chat-input" className="sr-only">
              Type your question
            </label>
            <input
              ref={inputRef}
              id="support-chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={300}
              autoComplete="off"
              placeholder="Ask about projects, prices, sectors..."
              className="min-w-0 flex-1 rounded-full border border-[#d9dce0] bg-[#fbfaf7] px-4 py-3 text-sm text-[#142536] outline-none focus:border-[#c9a45c] focus:bg-white focus:ring-4 focus:ring-[#c9a45c]/15"
            />
            <button
              type="submit"
              disabled={!input.trim() || typing}
              aria-label="Send"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[#142536] text-white transition hover:bg-[#c9a45c] hover:text-[#142536] disabled:opacity-40"
            >
              <SendHorizontal size={18} aria-hidden="true" />
            </button>
          </form>
          <p className="border-t border-[#f0ede7] px-4 py-2 text-[10px] leading-4 text-[#68717a]" aria-live="polite">
            {voiceNotice || "Voice input uses your browser’s speech service; Gratia Estates receives the resulting text."}
          </p>
        </section>
      )}
    </>
  );
}

function BotMessage({ message, onQuick, onNavigate, showQuick }) {
  return (
    <div className="max-w-[92%] space-y-2">
      <p className="w-fit whitespace-pre-line rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm leading-6 text-[#142536] shadow-sm">
        {message.text}
      </p>
      {message.links?.length > 0 && (
        <ul className="space-y-1.5">
          {message.links.map((link) => (
            <li key={link.to + link.text}>
              <Link
                to={link.to}
                onClick={onNavigate}
                className="flex items-start justify-between gap-2 rounded-xl border border-[#e7e2d8] bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#142536] transition hover:border-[#c9a45c]"
              >
                {link.text}
                <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-[#c9a45c]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {message.actions?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.actions.map((action) =>
            action.to ? (
              <Link
                key={action.label}
                to={action.to}
                onClick={onNavigate}
                className="rounded-full border border-[#142536]/20 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#142536] transition hover:border-[#c9a45c]"
              >
                {action.label}
              </Link>
            ) : (
              <a
                key={action.label}
                href={action.href}
                target={action.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="rounded-full bg-[#142536] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c9a45c] hover:text-[#142536]"
              >
                {action.label}
              </a>
            ),
          )}
        </div>
      )}
      {showQuick && message.quick?.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {message.quick.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => onQuick(reply)}
              className="rounded-full border border-[#c9a45c]/50 bg-[#fdf8ee] px-3 py-1.5 text-xs font-semibold text-[#80602b] transition hover:bg-[#c9a45c] hover:text-[#142536]"
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
