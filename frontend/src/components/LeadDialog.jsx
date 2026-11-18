import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CheckCircle2, Loader2, MessageCircle, PhoneCall, ShieldCheck, X } from "lucide-react";
import { projects } from "../data/projects";
import { submitLead } from "../services/leadsApi";
import { formatWhatsAppMessage, openWhatsApp } from "../utils/whatsapp";
import { track } from "../analytics/analytics";
import { BUDGET_OPTIONS, TIME_OPTIONS, todayIso, validateLead } from "../utils/leadValidation";

/*
 * One enquiry dialog used across the site:
 *   openLeadDialog({ kind: "callback" })
 *   openLeadDialog({ kind: "consultation", service: "Investment advice" })
 *   openLeadDialog({ kind: "property_enquiry", project })
 */
const EVENT = "gratia-open-lead-dialog";

export function openLeadDialog(options = {}) {
  track("enquiry_click", { detail: options.kind || "callback", property_slug: options.project?.slug });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: options }));
}

const COPY = {
  callback: {
    Icon: PhoneCall,
    eyebrow: "Request a callback",
    title: "We'll call you back",
    text: "Leave your number and a convenient time. An advisor will call you, usually within a few working hours.",
    submit: "Request callback",
  },
  consultation: {
    Icon: CalendarCheck,
    eyebrow: "Book a consultation",
    title: "Book a free consultation",
    text: "Choose a day and time to talk through your buying, selling or investment plans with an advisor.",
    submit: "Book consultation",
  },
  property_enquiry: {
    Icon: MessageCircle,
    eyebrow: "Enquire about property",
    title: "Ask about this property",
    text: "Get the latest price, availability, floor plans and payment options.",
    submit: "Send enquiry",
  },
  contact: {
    Icon: MessageCircle,
    eyebrow: "Contact us",
    title: "How can we help?",
    text: "Share your requirement and our team will get back to you.",
    submit: "Send enquiry",
  },
};

const empty = {
  name: "",
  phone: "",
  email: "",
  property_slug: "",
  location: "",
  budget: "",
  visit_date: "",
  visit_time: "",
  requirement: "",
  property_type: "",
  contact_time: "",
  message: "",
  call_consent: false,
  website: "",
};

export default function LeadDialogHost() {
  const [options, setOptions] = useState(null);

  useEffect(() => {
    const onOpen = (event) => setOptions({ kind: "callback", ...event.detail });
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  if (!options) return null;
  return <LeadDialog key={JSON.stringify(options.project?.slug ?? options)} options={options} onClose={() => setOptions(null)} />;
}

function LeadDialog({ options, onClose }) {
  const { kind, project, service } = options;
  const copy = COPY[kind] ?? COPY.callback;
  const [values, setValues] = useState({
    ...empty,
    property_slug: project?.slug ?? "",
    message: service ? `I'm interested in: ${service}.` : "",
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ state: "idle", message: "", reference: "" });
  const firstFieldRef = useRef(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const set = (field) => (event) => {
    const value = field === "phone" ? event.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16) : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const selected = projects.find((p) => p.slug === values.property_slug);

  const submit = async (event) => {
    event.preventDefault();
    if (status.state === "sending") return;
    const nextErrors = validateLead(values, { requireDate: kind === "consultation" });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setStatus({ state: "sending", message: "", reference: "" });
    try {
      const result = await submitLead(kind, {
        ...values,
        property_name: selected ? `${selected.name}, ${selected.location}` : "",
      });
      setStatus({
        state: "sent",
        reference: result.reference,
        message: result.duplicate
          ? values.call_consent
            ? "We already have this request. Your AI call preference has been recorded."
            : "We already have this request. Our advisor will be in touch soon."
          : values.call_consent
            ? "Thank you! If you opted in, our AI assistant may call during business hours."
            : "Thank you! Our advisor will contact you shortly.",
      });
    } catch (error) {
      setStatus({ state: "error", reference: "", message: error.message });
    }
  };

  const continueOnWhatsApp = () =>
    openWhatsApp(
      formatWhatsAppMessage(`📋 *${copy.eyebrow}*`, [
        [
          ["🔖", "Reference", status.reference],
          ["🏢", "Property", selected ? `${selected.name}, ${selected.location}` : ""],
          ["📅", "Preferred date", values.visit_date],
          ["🕐", "Preferred time", values.visit_time],
        ],
        [
          ["👤", "Name", values.name],
          ["📞", "Phone", values.phone],
          ["📝", "Message", values.message],
        ],
      ]),
    );

  const input =
    "h-12 w-full rounded-xl border border-charcoal/30 bg-white px-4 text-sm text-charcoal outline-none transition placeholder:text-charcoal/55 focus:border-gold focus:ring-4 focus:ring-gold/10";
  const labelText = "mb-1.5 block text-sm font-semibold text-charcoal";
  const errorText = (field) =>
    errors[field] ? (
      <span id={`lead-${field}-error`} className="mt-1 block text-xs font-semibold text-rose-700">
        {errors[field]}
      </span>
    ) : null;
  const aria = (field) => ({ "aria-invalid": Boolean(errors[field]) || undefined, "aria-describedby": errors[field] ? `lead-${field}-error` : undefined });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-charcoal/70 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-dialog-title"
        className="relative my-auto w-full max-w-[560px] rounded-3xl bg-white text-charcoal shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-charcoal/5 transition hover:bg-charcoal hover:text-white"
        >
          <X size={19} aria-hidden="true" />
        </button>

        <div className="px-5 pb-6 pt-7 sm:px-8 sm:pb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#8A6A2F]">
            <copy.Icon size={15} aria-hidden="true" /> {copy.eyebrow}
          </p>
          <h2 id="lead-dialog-title" className="mb-2 pr-12 font-display text-2xl font-bold sm:text-3xl">
            {copy.title}
          </h2>
          <p className="mb-6 text-sm leading-6 text-charcoal/85">
            {project ? `${project.name}, ${project.location}. ${copy.text}` : copy.text}
          </p>

          {status.state === "sent" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center" role="status">
              <CheckCircle2 size={36} className="mx-auto text-emerald-600" aria-hidden="true" />
              <p className="mt-3 font-display text-lg font-bold text-[#142536]">{status.message}</p>
              <p className="mt-2 text-sm text-[#263746]">
                Your reference: <strong className="font-mono text-base tracking-wide">{status.reference}</strong>
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={continueOnWhatsApp}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#15803D] px-4 py-3 text-sm font-bold text-white hover:bg-[#166534]"
                >
                  <MessageCircle size={16} aria-hidden="true" /> Also message on WhatsApp
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-charcoal/20 px-4 py-3 text-sm font-bold text-charcoal hover:bg-charcoal/5"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4">
              {/* Honeypot: hidden from people; bots fill it in. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={values.website}
                onChange={set("website")}
                className="hidden"
                aria-hidden="true"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block" htmlFor="lead-name">
                  <span className={labelText}>Full name *</span>
                  <input ref={firstFieldRef} id="lead-name" className={input} autoComplete="name" maxLength={80} placeholder="Your full name" value={values.name} onChange={set("name")} {...aria("name")} />
                  {errorText("name")}
                </label>
                <label className="block" htmlFor="lead-phone">
                  <span className={labelText}>Mobile number *</span>
                  <input id="lead-phone" type="tel" inputMode="tel" className={input} autoComplete="tel" placeholder="10-digit mobile number" value={values.phone} onChange={set("phone")} {...aria("phone")} />
                  {errorText("phone")}
                </label>
                <label className="block" htmlFor="lead-requirement">
                  <span className={labelText}>I want to</span>
                  <select id="lead-requirement" className={input} value={values.requirement} onChange={set("requirement")}>
                    <option value="">Choose</option>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                    <option value="rent">Rent / lease</option>
                    <option value="invest">Invest</option>
                  </select>
                </label>
                <label className="block" htmlFor="lead-contact-time">
                  <span className={labelText}>Best time to call</span>
                  <select id="lead-contact-time" className={input} value={values.contact_time} onChange={set("contact_time")}>
                    <option value="">Any time</option>
                    <option>Morning (9 AM – 12 PM)</option>
                    <option>Afternoon (12 PM – 4 PM)</option>
                    <option>Evening (4 PM – 8 PM)</option>
                  </select>
                </label>
                <label className="block sm:col-span-2" htmlFor="lead-email">
                  <span className={labelText}>
                    Email address <span className="font-normal text-charcoal/70">(optional)</span>
                  </span>
                  <input id="lead-email" type="email" className={input} autoComplete="email" maxLength={255} placeholder="you@example.com" value={values.email} onChange={set("email")} {...aria("email")} />
                  {errorText("email")}
                </label>
                {!project && kind !== "callback" && (
                  <label className="block sm:col-span-2" htmlFor="lead-property">
                    <span className={labelText}>Interested property</span>
                    <select id="lead-property" className={input} value={values.property_slug} onChange={set("property_slug")}>
                      <option value="">Not sure yet – suggest options</option>
                      {projects.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name} · {p.location}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {kind !== "callback" && (
                  <>
                    <label className="block" htmlFor="lead-location">
                      <span className={labelText}>Preferred location</span>
                      <input id="lead-location" className={input} maxLength={150} placeholder="e.g. Dwarka Expressway" value={values.location} onChange={set("location")} />
                    </label>
                    <label className="block" htmlFor="lead-type">
                      <span className={labelText}>Property type</span>
                      <select id="lead-type" className={input} value={values.property_type} onChange={set("property_type")}>
                        <option value="">Any</option>
                        <option>Apartment / flat</option>
                        <option>Luxury home</option>
                        <option>Villa / builder floor</option>
                        <option>Plot</option>
                        <option>Office space</option>
                        <option>Retail / SCO</option>
                      </select>
                    </label>
                    <label className="block" htmlFor="lead-budget">
                      <span className={labelText}>Budget</span>
                      <select id="lead-budget" className={input} value={values.budget} onChange={set("budget")}>
                        <option value="">Choose budget</option>
                        {BUDGET_OPTIONS.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label className="block" htmlFor="lead-date">
                  <span className={labelText}>
                    {kind === "callback" ? "Preferred day" : "Preferred date"}
                    {kind === "consultation" ? " *" : ""}
                  </span>
                  <input id="lead-date" type="date" min={todayIso()} className={input} value={values.visit_date} onChange={set("visit_date")} {...aria("visit_date")} />
                  {errorText("visit_date")}
                </label>
                <label className="block" htmlFor="lead-time">
                  <span className={labelText}>Preferred time</span>
                  <select id="lead-time" className={input} value={values.visit_time} onChange={set("visit_time")}>
                    <option value="">Any time</option>
                    {TIME_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2" htmlFor="lead-message">
                  <span className={labelText}>Message</span>
                  <textarea id="lead-message" rows={3} maxLength={2000} className={`${input} h-auto py-3`} placeholder="Anything we should know before we call?" value={values.message} onChange={set("message")} />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-charcoal/10 bg-[#fbfaf7] p-3 text-xs leading-5 text-charcoal/80">
                <input
                  type="checkbox"
                  checked={values.call_consent}
                  onChange={(event) => setValues((current) => ({ ...current, call_consent: event.target.checked }))}
                  className="mt-1 size-4 shrink-0 accent-[#142536]"
                />
                <span>
                  I agree to receive up to one automated AI follow-up call about this request, Monday–Saturday,
                  10 AM–7 PM IST. The assistant will identify itself as AI. This is optional.
                </span>
              </label>

              {status.state === "error" && (
                <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">
                  {status.message}{" "}
                  <a href="tel:+919109776155" className="underline">
                    Or call +91 91097 76155
                  </a>
                </p>
              )}

              <button
                type="submit"
                disabled={status.state === "sending"}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-charcoal px-5 text-sm font-bold text-white transition hover:bg-gold hover:text-charcoal disabled:cursor-wait disabled:opacity-70"
              >
                {status.state === "sending" ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <copy.Icon size={17} aria-hidden="true" />}
                {status.state === "sending" ? "Sending…" : copy.submit}
              </button>
              <p className="flex items-start justify-center gap-2 text-center text-xs leading-5 text-charcoal/75">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#8A6A2F]" aria-hidden="true" />
                <span>
                  Your details are used only to respond to you. See our{" "}
                  <Link to="/privacy-policy" onClick={onClose} className="underline">
                    privacy policy
                  </Link>
                  .
                </span>
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
