import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import WhatsAppButton from "./WhatsAppButton";
import ChatWidget from "./chat/ChatWidget";
import LeadDialogHost from "./LeadDialog";
import Toaster from "./Toaster";
import CookieConsent from "./CookieConsent";
import { trackPageView } from "../analytics/analytics";

export default function Layout({ children }) {
  const { pathname } = useLocation();

  // Scroll to top only when the page changes, not when query params change
  // (e.g. typing in the blog search), which would otherwise jump the page.
  useEffect(() => {
    trackPageView();
  }, [pathname]);

  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  // The private admin panel has its own layout, without the public site chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
      <WhatsAppButton />
      <ChatWidget />
      <LeadDialogHost />
      <CookieConsent />
      <Toaster />
    </>
  );
}
