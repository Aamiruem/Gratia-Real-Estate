import { Check, Film, Link2, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { projects } from "../data/projects";
import { deleteUploadedVideo, getVideoSource, uploadVideoFile } from "../utils/videoLibrary";
import VideoPreview from "./VideoPreview";

const TYPE_LABEL = { youtube: "YouTube video", vimeo: "Vimeo video", file: "Video file" };

/**
 * One-click add / edit / change-video dialog for the owner, with a live preview.
 * `focus` = "url" opens straight on the link field (for "Change video").
 */
export default function VideoEditorDialog({ initial, focus = "title", onSave, onDelete, onClose }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    url: initial?.url ?? "",
    description: initial?.description ?? "",
    projectSlug: initial?.projectSlug ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const titleRef = useRef(null);
  const urlRef = useRef(null);
  const fileRef = useRef(null);
  const linkedSource = getVideoSource(form.url.trim());
  const source = previewUrl ? { type: "file", src: previewUrl } : linkedSource;

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    (focus === "url" ? urlRef : titleRef).current?.focus();
    if (focus === "url") urlRef.current?.select();
    const onKey = (event) => event.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [focus, onClose, busy]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (field === "url") setSelectedFile(null);
    setError("");
  };

  const selectFile = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setSelectedFile(file);
    if (file) setForm((current) => ({ ...current, url: "" }));
    setUploadProgress(0);
    setError("");
    if (file && !form.title.trim()) {
      setForm((current) => ({ ...current, title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) }));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError("Please add a title for this video.");
    if (!selectedFile && !linkedSource) {
      return setError("Please paste a YouTube, Vimeo or direct video file link (.mp4, .webm, .mov).");
    }
    setBusy(true);
    setError("");
    let uploadedUrl = "";
    try {
      let url = form.url.trim();
      if (selectedFile) {
        const blob = await uploadVideoFile(selectedFile, ({ percentage }) => setUploadProgress(percentage));
        url = blob.url;
        uploadedUrl = blob.url;
      }
      const message = await onSave({ ...form, title: form.title.trim(), url, description: form.description.trim() });
      if (message) {
        if (uploadedUrl) await deleteUploadedVideo(uploadedUrl).catch(() => {});
        setError(message);
      }
    } catch (uploadError) {
      setError(uploadError.message || "The video could not be uploaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sizeLabel = selectedFile
    ? selectedFile.size >= 1024 ** 3
      ? `${(selectedFile.size / 1024 ** 3).toFixed(2)} GB`
      : `${(selectedFile.size / 1024 ** 2).toFixed(1)} MB`
    : "";

  const input =
    "w-full rounded-xl border border-[#d9dce0] bg-white px-4 py-3 text-sm text-[#142536] outline-none placeholder:text-[#87909a] focus:border-[#c9a45c] focus:ring-4 focus:ring-[#c9a45c]/15";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-[#0d1b2a]/70 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-editor-title"
        className="my-8 grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[1.05fr_.95fr]"
      >
        {/* Live preview */}
        <div className="flex flex-col bg-[#0f1f2e] p-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#e1c98f]">Live preview</p>
          <div className="mt-3 aspect-video overflow-hidden rounded-2xl bg-black">
            {source ? (
              <VideoPreview key={form.url} video={{ title: form.title || "Preview", url: form.url.trim() }} showLogo={false} />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-white/60">
                <span>
                  <Film size={30} className="mx-auto mb-2 text-white/40" aria-hidden="true" />
                  Paste a video link to see it here
                </span>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-white/60">
            {source ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300">
                <Check size={13} aria-hidden="true" /> {TYPE_LABEL[source.type]} detected
              </span>
            ) : (
              "Supported: YouTube, Vimeo, and device video uploads. Device file playback depends on the browser's codec support."
            )}
          </p>
        </div>

        {/* Fields */}
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 id="video-editor-title" className="font-display text-2xl font-semibold text-[#142536]">
              {editing ? (focus === "url" ? "Change video" : "Edit video") : "Add a video"}
            </h2>
            <button type="button" onClick={onClose} disabled={busy} className="grid size-9 place-items-center rounded-full text-[#68717a] hover:bg-[#f1ede4]" aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.1em] text-[#536272]">
                <Link2 size={13} aria-hidden="true" /> Video link
              </span>
              <input ref={urlRef} type="url" value={form.url} onChange={update("url")} placeholder="Paste a YouTube, Vimeo or direct video URL" className={input} />
            </label>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="video/*,.3g2,.3gp,.avi,.flv,.m2ts,.m4v,.mkv,.mov,.mpe,.mpeg,.mpg,.mts,.ogv,.ts,.wmv"
                onChange={selectFile}
                className="sr-only"
                aria-label="Choose a video file from this device"
              />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#c9a45c] bg-[#fbf8f0] px-4 py-3 text-sm font-semibold text-[#142536] hover:bg-[#f5eedc] disabled:opacity-60">
                <Upload size={16} aria-hidden="true" /> Upload video from this device
              </button>
              <p className="mt-1.5 text-xs leading-5 text-[#68717a]">Common video formats · up to 5 GB · uploads directly to video storage</p>
              {selectedFile && (
                <div className="mt-3 rounded-xl border border-[#e7e2d8] bg-[#fbf8f0] p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-all font-medium text-[#142536]">{selectedFile.name}<span className="ml-2 text-xs font-normal text-[#68717a]">{sizeLabel}</span></span>
                    <button type="button" onClick={() => setSelectedFile(null)} disabled={busy} className="shrink-0 rounded-full p-1 text-[#68717a] hover:bg-white" aria-label="Remove selected video"><X size={16} /></button>
                  </div>
                  {busy && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e7e2d8]"><div className="h-full bg-[#c9a45c] transition-all" style={{ width: `${uploadProgress}%` }} /></div>}
                </div>
              )}
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#536272]">Title</span>
              <input ref={titleRef} value={form.title} onChange={update("title")} maxLength={120} placeholder="e.g. Gurgaon project walkthrough" className={input} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#536272]">
                Link to a project <span className="font-normal normal-case tracking-normal">(optional)</span>
              </span>
              <select value={form.projectSlug} onChange={update("projectSlug")} className={input}>
                <option value="">General video (not linked to a project)</option>
                {projects.map((project) => (
                  <option key={project.slug} value={project.slug}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#536272]">
                Short description <span className="font-normal normal-case tracking-normal">(optional)</span>
              </span>
              <textarea rows={2} value={form.description} onChange={update("description")} maxLength={300} placeholder="A brief note about what viewers will see." className={`${input} resize-y`} />
            </label>
          </div>

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#142536] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#c9a45c] hover:text-[#142536] disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : editing ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {busy ? (selectedFile && uploadProgress < 100 ? `Uploading ${Math.round(uploadProgress)}%` : "Saving...") : editing ? "Save changes" : "Add video"}
            </button>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-[#d9dce0] px-5 py-3 text-sm font-semibold text-[#142536] hover:border-[#9aa4ad]">
              Cancel
            </button>
            {editing && onDelete && (
              <button type="button" onClick={onDelete} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50">
                <Trash2 size={15} aria-hidden="true" /> Delete
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
