import LegalPage from "../components/LegalPage";
import SEO from "../components/SEO";

const privacySections = [
  {
    title: "Information we collect",
    body: [
      "We may collect personal information that you choose to share with us, including your name, phone number, email address, preferred location, budget, project interest and property requirement.",
      "We may also receive basic technical information such as device type, browser type, pages visited and general interaction data to help improve the website experience.",
    ],
  },
  {
    title: "How we use your information",
    body: [
      "We use your information to respond to enquiries, arrange callbacks, schedule site visits, share relevant project details, understand your buying requirement and provide real estate advisory support.",
      "We may use limited website usage information to improve page performance, content quality and enquiry flows.",
    ],
  },
  {
    title: "Communication and consent",
    body: [
      "When you submit an enquiry, call us, email us or contact us through WhatsApp, we may contact you about that property requirement. Submitting an enquiry alone does not enroll you in automated AI calls.",
      "We schedule an automated AI follow-up call only after your explicit consent is recorded, either through the separate, optional form checkbox or when you directly ask our team to arrange one. Calls are limited to Monday–Saturday, 10 AM–7 PM India time. You may withdraw consent or ask us to stop follow-up communication at any time using the contact details below.",
      "If you use voice input in the website assistant, your browser's speech service processes the audio and the resulting text is sent to our website to answer your question. You can type instead.",
    ],
  },
  {
    title: "Sharing of information",
    body: [
      "We do not sell your personal information. We may share relevant enquiry details with trusted team members, channel partners, developers or service providers only when needed to respond to your request, arrange a visit or provide project information.",
      "For an AI phone call you request or consent to, your name, phone number and relevant published property details are sent to our voice-service provider, Retell AI, to place and handle that call. If you call our Retell-powered number, the provider processes the call and information you choose to share. Call audio and metadata may be processed under the provider's settings and privacy terms.",
      "We may disclose information if required by law, regulation, legal process or a lawful request from a government authority.",
    ],
  },
  {
    title: "Cookies, analytics and notifications",
    body: [
      "With your consent we use analytics cookies (Google Analytics 4 and our own first-party analytics) to understand which pages and properties are useful. We never send your name, phone number, email or form contents to analytics. See our Cookie Policy at /cookie-policy; you can change your choice any time via Cookie settings in the footer.",
      "Confirmations and updates about your enquiries are saved with a random device key so they appear in this browser's notification bell. Browser alerts are sent only if you turn them on.",
    ],
  },
  {
    title: "Data security and retention",
    body: [
      "We take reasonable steps to protect your information from unauthorised access, misuse, loss or disclosure. However, no website, messaging platform or internet transmission can be guaranteed to be completely secure.",
      "Our CRM stores call status and a short call summary, not call transcripts or recordings. The voice-service provider may retain or process call audio according to its settings and policies.",
      "We retain enquiry information only for as long as reasonably necessary for advisory, follow-up, record-keeping, legal or business purposes.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "You may request access, correction, update or deletion of your personal information, subject to applicable law and legitimate record-keeping requirements.",
      "To make a privacy request or withdraw consent for future communication, please contact us using the details below.",
    ],
  },
  {
    title: "Cookies and third-party links",
    body: [
      "This website may use cookies or similar technologies for performance, analytics and usability. You can control cookies through your browser settings.",
      "Our website may contain links to third-party websites, developer pages, map services, social platforms or messaging services. Their privacy practices are governed by their own policies.",
    ],
  },
  {
    title: "Contact for privacy questions",
    body: [
      "For privacy-related questions, corrections, consent withdrawal or data requests, contact Gratia Estates at purwarmanish@gmail.com or +91 9109776155.",
    ],
  },
];

export default function Privacy() {
  return (
    <>
      <SEO
        title="Privacy Policy | Gratia Estates"
        description="Privacy Policy for Gratia Estates website and property enquiries."
        path="/privacy-policy"
      />
      <LegalPage
        title="Privacy Policy"
        intro="How Gratia Estates collects, uses, stores and protects information shared through this website, phone calls, email, WhatsApp and property enquiry forms."
        updated="October 7, 2026"
        sections={privacySections}
        disclaimer="This policy is intended as general website information and should not be treated as legal advice. Please consult a qualified legal professional for formal compliance review."
      />
    </>
  );
}
