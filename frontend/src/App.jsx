import { Component, lazy, Suspense } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import { usePropertiesVersion } from "./data/liveProperties";

// The home page loads with the main bundle; every other page is downloaded
// only when visited, which keeps the first load small and fast.
const About = lazy(() => import("./pages/About"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetails = lazy(() => import("./pages/ProjectDetails"));
const Contact = lazy(() => import("./pages/Contact"));
const BookVisit = lazy(() => import("./pages/BookVisit"));
const Videos = lazy(() => import("./pages/Videos"));
const VideoAdminAuth = lazy(() => import("./pages/VideoAdminAuth"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogDetails = lazy(() => import("./pages/BlogDetails"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AdminApp = lazy(() => import("./admin/AdminApp"));
const Residential = lazy(() => import("./pages/Residential"));
const Commercial = lazy(() => import("./pages/Commercial"));
const Services = lazy(() => import("./pages/Services"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoading() {
  return (
    <div className="container-luxury flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="size-10 animate-spin rounded-full border-4 border-[#e7e2d8] border-t-[#c9a45c]" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

// A page that fails to load (e.g. offline and not saved yet) shows a friendly
// message instead of a blank screen.
class PageErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container-luxury flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <h1 className="font-display text-3xl font-bold text-[#142536]">This page couldn't load</h1>
        <p className="mt-3 max-w-md text-[#4b5966]">
          {navigator.onLine
            ? "Something went wrong while loading this page. Please try again."
            : "You're offline and this page isn't saved on your device yet. Reconnect and try again."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-full bg-[#142536] px-6 py-3 text-sm font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]"
        >
          Try again
        </button>
      </div>
    );
  }
}

export default function App() {
  const { pathname } = useLocation();
  // Re-render pages when live listings arrive from the backend.
  usePropertiesVersion();
  return (
    <Layout>
      {/* Keyed by page so a failed page doesn't stay stuck after navigating. */}
      <PageErrorBoundary key={pathname}>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:slug" element={<ProjectDetails />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/book-visit" element={<BookVisit />} />
            <Route path="/videos" element={<Videos />} />
            <Route path="/video-admin/login" element={<VideoAdminAuth />} />
            <Route
              path="/video-admin/signup"
              element={<Navigate to="/video-admin/login" replace />}
            />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetails />} />
            <Route path="/privacy-policy" element={<Privacy />} />
            <Route path="/terms-conditions" element={<Terms />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/properties" element={<Navigate to="/projects" replace />} />
            <Route path="/residential" element={<Residential />} />
            <Route path="/commercial" element={<Commercial />} />
            <Route path="/services" element={<Services />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </PageErrorBoundary>
    </Layout>
  );
}
