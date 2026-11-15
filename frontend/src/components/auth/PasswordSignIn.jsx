import { useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, MailCheck } from "lucide-react";
import { authApi } from "../../services/authApi";

export const inputClass =
  "w-full rounded-xl border border-[#d9dce0] bg-[#fbfaf7] px-4 py-3.5 text-sm text-[#142536] outline-none transition placeholder:text-[#7d8790] focus:border-[#c9a45c] focus:bg-white focus:ring-4 focus:ring-[#c9a45c]/15";
const primaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#142536] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#263f55] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/40 disabled:cursor-not-allowed disabled:opacity-65";

// Mirrors the server's rules (backend/app/routers/password_auth.py) so people
// see what's missing before submitting. The server always checks again.
export function passwordChecks(password, email = "") {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const local = email.split("@")[0].toLowerCase();
  return [
    { label: "At least 10 characters", ok: password.length >= 10 },
    { label: "Three of: lowercase, uppercase, number, symbol", ok: kinds >= 3 },
    { label: "Doesn't contain your email name", ok: !(local.length >= 4 && password.toLowerCase().includes(local)) },
  ];
}

export function PasswordField({ id, label, value, onChange, autoComplete, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-semibold text-[#263746]">{label}</span>
      <span className="relative block">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          maxLength={128}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${inputClass} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-[#5e6872] hover:bg-[#f1ede4] hover:text-[#142536]"
        >
          {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

export function StrengthList({ password, email }) {
  if (!password) return null;
  return (
    <ul className="grid gap-1 text-xs" aria-live="polite">
      {passwordChecks(password, email).map(({ label, ok }) => (
        <li key={label} className={`flex items-center gap-1.5 ${ok ? "text-emerald-700" : "text-[#5e6872]"}`}>
          <CheckCircle2 size={13} className={ok ? "" : "opacity-40"} aria-hidden="true" /> {label}
        </li>
      ))}
    </ul>
  );
}

/** Email + password sign-in, with "remember me" and the forgot-password flow. */
export default function PasswordSignIn({ onSignedIn, onUseCode }) {
  const [view, setView] = useState("login"); // login | forgot | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const run = async (task) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const signIn = (event) => {
    event.preventDefault();
    run(async () => onSignedIn(await authApi.passwordLogin(email.trim(), password, remember)));
  };

  const sendReset = (event) => {
    event.preventDefault();
    run(async () => {
      const reply = await authApi.forgotPassword(email.trim());
      setChallengeId(reply.challenge_id);
      setNotice(reply.message);
      setView("reset");
    });
  };

  const reset = (event) => {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    if (!passwordChecks(newPassword, email).every((c) => c.ok)) {
      setError("Please choose a stronger password (see the checklist).");
      return;
    }
    run(async () => {
      const reply = await authApi.resetPassword(challengeId, code.trim(), newPassword);
      setPassword("");
      setCode("");
      setNewPassword("");
      setConfirm("");
      setNotice(reply.message);
      setView("login");
    });
  };

  const messages = (
    <>
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {error}
        </div>
      )}
      {notice && !error && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          {notice}
        </div>
      )}
    </>
  );

  if (view === "forgot") {
    return (
      <form onSubmit={sendReset} className="mt-8 grid gap-5">
        <div>
          <p className="flex items-center gap-2 font-display text-xl font-semibold text-[#142536]">
            <KeyRound size={19} className="text-[#9a7940]" aria-hidden="true" /> Reset your password
          </p>
          <p className="mt-1 text-sm leading-6 text-[#5e6872]">
            Enter your staff email. We'll send a 6-digit code to reset your password.
          </p>
        </div>
        {messages}
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#263746]">Email</span>
          <input type="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} />
        </label>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <MailCheck size={17} aria-hidden="true" />}
          {busy ? "Sending…" : "Send reset code"}
        </button>
        <button type="button" onClick={() => { setView("login"); setError(""); setNotice(""); }} className="inline-flex items-center gap-2 text-sm font-medium text-[#5e6872] hover:text-[#142536]">
          <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
        </button>
      </form>
    );
  }

  if (view === "reset") {
    return (
      <form onSubmit={reset} className="mt-8 grid gap-5">
        <div>
          <p className="font-display text-xl font-semibold text-[#142536]">Choose a new password</p>
          <p className="mt-1 text-sm leading-6 text-[#5e6872]">Enter the code from the email and your new password. All other sessions will be signed out.</p>
        </div>
        {messages}
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#263746]">6-digit code</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className={`${inputClass} tracking-[.4em]`}
          />
        </label>
        <PasswordField id="reset-new" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
        <StrengthList password={newPassword} email={email} />
        <PasswordField id="reset-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
          {busy ? "Saving…" : "Reset password"}
        </button>
        <button type="button" onClick={() => { setView("forgot"); setError(""); setNotice(""); }} className="text-left text-sm font-medium text-[#5e6872] hover:text-[#142536]">
          Didn't get the code? Send a new one
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={signIn} className="mt-8 grid gap-5">
      {messages}
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#263746]">Email</span>
        <input type="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} />
      </label>
      <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#263746]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[#142536]" />
          Remember me on this device
        </label>
        <button type="button" onClick={() => { setView("forgot"); setError(""); setNotice(""); }} className="text-sm font-semibold text-[#80602b] hover:underline">
          Forgot password?
        </button>
      </div>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs leading-5 text-[#5e6872]">
        No password yet?{" "}
        <button type="button" onClick={onUseCode} className="font-semibold text-[#142536] underline">
          Sign in with a one-time code
        </button>
        , then set one in Admin → My account.
      </p>
    </form>
  );
}
