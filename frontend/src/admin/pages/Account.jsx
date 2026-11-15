import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import useOwner, { notifyAuthChanged } from "../../hooks/useOwner";
import { authApi } from "../../services/authApi";
import { toast } from "../../components/Toaster";
import { PasswordField, StrengthList, passwordChecks } from "../../components/auth/PasswordSignIn";
import OwnerEmailChange from "../../components/OwnerEmailChange";

const dateTime = (value) =>
  value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "";

/** Signed-in staff: set or change the password and sign out other sessions. */
export default function Account() {
  const { user, role } = useOwner();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);

  useEffect(() => {
    authApi.passwordStatus().then(setStatus, (err) => setError(err.message));
  }, []);

  const hasPassword = status?.password_set;
  const email = user?.email || "";
  const emailChanged = () => {
    setEditingEmail(false);
    notifyAuthChanged();
    toast("Sign-in email changed. Other sessions were signed out.");
  };

  const save = async (event) => {
    event.preventDefault();
    setError("");
    if (next !== confirm) return setError("The two new passwords don't match.");
    if (!passwordChecks(next, email).every((c) => c.ok)) return setError("Please choose a stronger password (see the checklist).");
    setBusy(true);
    try {
      await authApi.setPassword(next, hasPassword ? current : null, signOutOthers);
      setStatus(await authApi.passwordStatus());
      setCurrent("");
      setNext("");
      setConfirm("");
      toast(hasPassword ? "Password changed." : "Password set. You can now sign in with it.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const logoutEverywhere = async () => {
    setLoggingOut(true);
    try {
      await authApi.logoutAll();
      notifyAuthChanged();
      navigate("/video-admin/login", { replace: true });
    } catch (err) {
      toast(err.message, "error");
      setLoggingOut(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#80602b]">Admin panel</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-[#142536] sm:text-3xl">My account</h1>
        <p className="mt-1 text-sm text-[#4b5966]">Your sign-in details and security.</p>
      </div>

      <section className="rounded-2xl border border-[#e7e2d8] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#142536] text-[#e1c98f]">
            <UserRound size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[#142536]">{user?.name || "Staff member"}</p>
            <p className="truncate text-sm text-[#4b5966]">{email}</p>
          </div>
          {role && <span className="ml-auto rounded-full bg-[#f3ead8] px-3 py-1 text-xs font-bold capitalize text-[#80602b]">{role}</span>}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-[#e7e2d8] bg-[#142536] p-5 text-white shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Mail size={18} className="text-[#e1c98f]" aria-hidden="true" /> Sign-in email
        </h2>
        <p className="mt-1 text-sm text-white/70">
          Verify the new address with a code. Your other sessions will be signed out.
        </p>
        {editingEmail ? (
          <OwnerEmailChange
            currentEmail={email}
            onChanged={emailChanged}
            onCancel={() => setEditingEmail(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingEmail(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#c9a45c] px-5 py-2.5 text-sm font-bold text-[#142536] transition hover:bg-[#e1c98f]"
          >
            <Mail size={15} aria-hidden="true" /> Change email
          </button>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-[#e7e2d8] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#142536]">
              <KeyRound size={18} className="text-[#80602b]" aria-hidden="true" />
              {hasPassword ? "Change password" : "Set a password"}
            </h2>
            <p className="mt-1 text-sm text-[#4b5966]">
              {status === null
                ? "Checking…"
                : hasPassword
                  ? `Password set on ${dateTime(status.password_set_at)}. One-time codes keep working too.`
                  : "You currently sign in with one-time codes only. Add a password to sign in faster; codes keep working."}
            </p>
          </div>
        </div>

        <form onSubmit={save} className="mt-5 grid gap-4">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
              {error}
            </p>
          )}
          {hasPassword && <PasswordField id="account-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />}
          <PasswordField id="account-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <StrengthList password={next} email={email} />
          <PasswordField id="account-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <label className="inline-flex items-center gap-2 text-sm text-[#263746]">
            <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} className="size-4 accent-[#142536]" />
            Sign out my other devices
          </label>
          <button
            type="submit"
            disabled={busy || status === null}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-[#142536] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9a45c] hover:text-[#142536] disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {hasPassword ? "Change password" : "Set password"}
          </button>
        </form>
      </section>

      <section className="mt-5 rounded-2xl border border-[#e7e2d8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#142536]">
          <ShieldCheck size={18} className="text-[#80602b]" aria-hidden="true" /> Sessions
        </h2>
        <p className="mt-1 text-sm text-[#4b5966]">
          Lost a phone or signed in on a shared computer? Sign out everywhere, including this browser.
        </p>
        <button
          type="button"
          onClick={logoutEverywhere}
          disabled={loggingOut}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-5 py-2.5 text-sm font-bold text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
        >
          {loggingOut ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
          Sign out on all devices
        </button>
      </section>
    </div>
  );
}
