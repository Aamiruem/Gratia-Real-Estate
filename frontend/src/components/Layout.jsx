import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import WhatsAppButton from "./WhatsAppButton";
import ChatWidget from "./chat/ChatWidget";
import LeadDialogHost from "./LeadDialog";
import Toaster from "./Toaster";
import CookieConsent from "./CookieConsent";
import AdminRail, { ADMIN_RAIL_WIDTH } from "./AdminRail";
import useOwner from "../hooks/useOwner";
import { trackPageView } from "../analytics/analytics";

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const { isStaff } = useOwner();

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
      {/* Signed-in staff get a slim admin sidebar on the left (large screens). */}
      <AdminRail />
      <div className={isStaff ? ADMIN_RAIL_WIDTH : undefined}>
        <main>{children}</main>
        <Footer />
      </div>
      <WhatsAppButton />
      <ChatWidget />
      <LeadDialogHost />
      <CookieConsent />
      <Toaster />
    </>
  );
}
