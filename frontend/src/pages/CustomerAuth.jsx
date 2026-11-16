import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import SEO from "../components/SEO";
import { authApi } from "../services/authApi";
import useOwner, { notifyAuthChanged } from "../hooks/useOwner";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";
const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#d9dce0] bg-[#fbfaf7] px-4 py-3 text-sm text-[#142536] outline-none transition placeholder:text-[#9ba2a9] focus:border-[#c9a45c] focus:bg-white focus:ring-4 focus:ring-[#c9a45c]/15";

export default function CustomerAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { checked, user } = useOwner();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const googleButtonRef = useRef(null);
  const googleCallbackRef = useRef(null);
  const nextPath = typeof location.state?.from === "string" ? location.state.from : null;

  const finishSignIn = useCallback(async (result) => {
    if (result.user?.role !== "user") {
      await authApi.logout();
      throw new Error("This sign-in is for customer accounts only.");
    }
    notifyAuthChanged();
    navigate(nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/", { replace: true });
  }, [navigate, nextPath]);

  const onGoogleCredential = useCallback(async (credential) => {
    setError("");
    setBusy(true);
    try {
      const result = await authApi.customerGoogleLogin(credential);
      await finishSignIn(result);
    } catch (authError) {
      setError(authError.message || "Google sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [finishSignIn]);

  googleCallbackRef.current = onGoogleCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return undefined;
    let active = true;
    const renderGoogleButton = () => {
      if (!active || !window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({ credential }) => {
          if (credential) void googleCallbackRef.current?.(credential);
        },
      });
      googleButtonRef.current.replaceChildren();
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: Math.min(360, googleButtonRef.current.clientWidth || 360),
      });
    };

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton);
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderGoogleButton);
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      existingScript?.removeEventListener("load", renderGoogleButton);
    };
  }, []);

  useEffect(() => {
    if (!challenge || !challenge.resend_after_seconds) return undefined;
    setResendIn(challenge.resend_after_seconds);
    const timer = window.setInterval(() => {
      setResendIn((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setChallenge(null);
    setCode("");
    setError("");
  };

  const requestCode = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = mode === "signup"
        ? await authApi.customerPhoneSignup(name.trim(), email.trim(), phone.trim())
        : await authApi.customerPhoneLogin(phone.trim());
      setChallenge(result);
      setCode("");
    } catch (authError) {
      setError(authError.message || "Could not send a verification code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await finishSignIn(await authApi.verifyCode(challenge.challenge_id, code.trim()));
    } catch (authError) {
      setError(authError.message || "The code could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setError("");
    setBusy(true);
    try {
      setChallenge(await authApi.resendCode(challenge.challenge_id));
    } catch (authError) {
      setError(authError.message || "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await authApi.logout();
      notifyAuthChanged();
      setError("");
    } catch (authError) {
      setError(authError.message || "Could not sign out.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SEO title="Optional customer sign-in | Gratia Estates" description="Sign in or create an optional Gratia Estates customer account." path="/account" noindex />
      <section className="bg-[#f4f0e7] px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_90px_rgba(20,37,54,.16)]">
          <div className="bg-[#142536] px-6 py-6 sm:px-9">
            <Link to="/" aria-label="Gratia Estates home">
              <Logo variant="light" className="h-11 text-[17px]" />
            </Link>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-[#e1c98f]">Customer account · Optional</p>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              {user?.role === "user" ? "Your account" : challenge ? "Verify your phone" : "Welcome to Gratia Estates"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Browse properties and view every detail without signing in. Sign in only if you want an account.
            </p>
          </div>

          <div className="p-6 sm:p-9">
            {checked && user?.role === "user" ? (
              <div>
                <p className="text-sm font-semibold text-[#142536]">Signed in as {user.name}</p>
                <p className="mt-1 text-sm text-[#68717a]">{user.email}</p>
                <button type="button" onClick={signOut} disabled={busy} className="mt-6 rounded-full border border-[#e7e2d8] px-5 py-2.5 text-sm font-bold text-[#142536] hover:bg-[#f3ead8] disabled:opacity-60">
                  {busy ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : challenge ? (
              <form onSubmit={verifyCode}>
                <p className="text-sm leading-6 text-[#4b5966]">
                  Enter the 6-digit code sent to <strong className="text-[#142536]">{challenge.sent_to}</strong>.
                </p>
                {challenge.local_code && (
                  <p className="mt-3 rounded-xl bg-[#fbf6ea] px-3 py-2 text-xs text-[#80602b]">
                    Local development code: <strong>{challenge.local_code}</strong>
                  </p>
                )}
                <label htmlFor="customer-otp" className="mt-5 block text-sm font-semibold text-[#142536]">Verification code</label>
                <input
                  id="customer-otp"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
                {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
                <button type="submit" disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a45c] px-5 py-3 text-sm font-bold text-[#142536] transition hover:bg-[#e1c98f] disabled:cursor-wait disabled:opacity-60">
                  {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                  Verify and sign in
                </button>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <button type="button" onClick={() => { setChallenge(null); setCode(""); setError(""); }} className="inline-flex items-center gap-1 text-[#5e6872] hover:text-[#142536]">
                    <ArrowLeft size={15} aria-hidden="true" /> Change details
                  </button>
                  <button type="button" onClick={resendCode} disabled={busy || resendIn > 0} className="font-semibold text-[#80602b] hover:underline disabled:cursor-not-allowed disabled:opacity-50">
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-2 rounded-full bg-[#f3f1ec] p-1">
                  <button type="button" onClick={() => switchMode("login")} aria-pressed={mode === "login"} className={`rounded-full px-3 py-2.5 text-sm font-bold transition ${mode === "login" ? "bg-white text-[#142536] shadow-sm" : "text-[#68717a]"}`}>Log in</button>
                  <button type="button" onClick={() => switchMode("signup")} aria-pressed={mode === "signup"} className={`rounded-full px-3 py-2.5 text-sm font-bold transition ${mode === "signup" ? "bg-white text-[#142536] shadow-sm" : "text-[#68717a]"}`}>Sign up</button>
                </div>

                <form onSubmit={requestCode} className="space-y-4">
                  {mode === "signup" && (
                    <>
                      <label className="block text-sm font-semibold text-[#142536]">
                        Name
                        <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} autoComplete="name" maxLength={100} required />
                      </label>
                      <label className="block text-sm font-semibold text-[#142536]">
                        Email
                        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} autoComplete="email" required />
                      </label>
                    </>
                  )}
                  <label className="block text-sm font-semibold text-[#142536]">
                    Phone number
                    <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} autoComplete="tel" placeholder="+91 98765 43210" maxLength={24} required />
                  </label>
                  {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
                  <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#142536] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9a45c] hover:text-[#142536] disabled:cursor-wait disabled:opacity-60">
                    {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
                    Send phone verification code
                  </button>
                </form>

                <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[#9ba2a9]">
                  <span className="h-px flex-1 bg-[#e7e2d8]" /> or <span className="h-px flex-1 bg-[#e7e2d8]" />
                </div>
                {GOOGLE_CLIENT_ID ? (
                  <div ref={googleButtonRef} className="flex min-h-10 justify-center" />
                ) : (
                  <div className="rounded-xl border border-[#e7e2d8] bg-[#fbfaf7] px-4 py-3 text-center text-xs leading-5 text-[#68717a]">
                    Google sign-in will be available after the Google OAuth Client ID is configured.
                  </div>
                )}
              </>
            )}
            <p className="mt-6 text-center text-xs text-[#68717a]">
              <Link to="/" className="font-semibold text-[#80602b] hover:underline">Continue browsing without signing in</Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
