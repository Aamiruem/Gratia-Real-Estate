import LegalPage from "../components/LegalPage";
import SEO from "../components/SEO";
import { openCookieSettings } from "../analytics/analytics";

const sections = [
  {
    title: "What cookies and similar storage we use",
    body: [
      "Essential storage: remembers things the website needs to work, such as your owner sign-in session, notification read status, your cookie choice and whether the enquiry popup was already shown. These do not track you across websites.",
      "Analytics cookies (only with your consent): Google Analytics 4 and our own first-party analytics record which pages and properties are viewed, how visitors arrive (for example search or social) and which buttons are used, so we can improve the website.",
    ],
  },
  {
    title: "What analytics do not collect",
    body: [
      "We never send your name, phone number, email address or the contents of forms to Google Analytics or to our analytics database. Analytics use a random identifier that is not linked to your enquiries.",
      "Advertising and ad-personalisation features of Google are switched off.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "Analytics run only after you click Accept in the cookie banner. If you click Decline, no analytics cookies are set and no analytics events are recorded.",
      "You can change your choice at any time using the Cookie settings link at the bottom of every page, or by clearing this website's data in your browser.",
    ],
  },
  {
    title: "Browser notifications and the installable app",
    body: [
      "If you turn on alerts, your browser stores a push subscription so we can send updates such as new listings. You can turn alerts off from the notification bell or in your browser settings at any time.",
      "Installing the Gratia Estates app stores website files on your device so pages load faster and work offline. Uninstalling the app removes them.",
    ],
  },
  {
    title: "Contact",
    body: ["Questions about cookies or your data? Email purwarmanish@gmail.com or call +91 91097 76155."],
  },
];

export default function CookiePolicy() {
  return (
    <>
      <SEO
        title="Cookie Policy | Gratia Estates"
        description="How Gratia Estates uses cookies and analytics, what is never collected, and how to change your choice."
        path="/cookie-policy"
      />
      <LegalPage
        title="Cookie Policy"
        intro="How we use cookies, analytics and local storage, and how you stay in control."
        updated="15 November 2026"
        sections={sections}
        disclaimer={
          <button type="button" onClick={openCookieSettings} className="font-semibold text-[#142536] underline">
            Open cookie settings
          </button>
        }
      />
    </>
  );
}
