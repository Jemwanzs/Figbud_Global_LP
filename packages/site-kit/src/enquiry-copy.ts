/**
 * The enquiry form's English wording: the corporate site's dictionary uses it
 * (other languages translate it there), and product websites show it as is.
 */
export const enquiryFormCopy = {
  title: "Send us a message",
  kind: "What would you like to talk about?",
  kinds: {
    demo_request: "Request a demo",
    sales: "Sales enquiry",
    contact: "General question",
    partnership: "Partnership",
    early_access: "Early access",
    waitlist: "Join a waitlist",
  },
  product: "Product",
  closedTitle: "{product} isn't taking enquiries right now",
  closedDefault: "Please check back soon, or ask us about another FigBud product below.",
  closedOption: "{product} (not taking enquiries)",
  productOptions: {
    figbud: "FigBud Global / not sure yet",
    zirahr: "ZiraHR",
    jasiri: "Jasiri LMS",
    expense_now: "Expense Now",
    ziwa: "Ziwa LMS",
  },
  name: "Full name",
  email: "Work email",
  emailHint: "company email preferred",
  company: "Company or organisation",
  jobTitle: "Job title",
  phone: "Phone",
  country: "Country",
  countries: {
    placeholder: "Select a country",
    search: "Search countries",
    none: "No countries match",
    suggested: "Suggested",
    all: "All countries",
  },
  phones: {
    country: "Phone country",
    add: "Add another number",
    remove: "Remove",
    second: "Second phone",
  },
  companySize: "Company size",
  companySizePlaceholder: "Select a size",
  message: "How can we help?",
  optional: "optional",
  consent:
    "I agree that FigBud Global may store these details and contact me about my enquiry, as described in the {privacy}.",
  privacyLink: "Privacy Policy",
  submit: "Send enquiry",
  submitting: "Sending…",
  successTitle: "Thank you. We've received your enquiry.",
  successBody: "We've sent a confirmation to your inbox. Your reference is {reference}.",
  another: "Send another enquiry",
  errors: {
    required: "This field is required.",
    email: "Enter a valid email address, like name@company.com.",
    consent: "Please agree so we can respond to your enquiry.",
    messageShort: "Tell us a little more (at least 10 characters).",
    phone: "Enter a valid phone number for the selected country.",
    phoneDuplicate: "This is the same number as the first one.",
    generic: "Something went wrong. Please try again.",
    network: "We couldn't reach our servers. Check your connection and try again.",
    rateLimited: "Too many submissions. Please wait a few minutes and try again.",
    closed:
      "{product} isn't taking enquiries right now. Choose another product, or ask us about FigBud Global.",
    summary: "Please correct the highlighted fields.",
  },
};

export type EnquiryFormCopy = typeof enquiryFormCopy;

/**
 * The two-stage form's wording (owner's brief, 13 Nov 2026), on product
 * websites and, from 14 Nov 2026, FigBud Global's contact page. Passing it
 * to `EnquiryForm` turns the stages on; without it, the form is one column.
 */
export const enquiryStagesCopy = {
  oneTitle: "Let's get acquainted",
  oneLead: "A few details, and we're off!",
  twoTitle: "Tell us more",
  twoLead: "Almost there. What can we help you achieve?",
  continue: "Continue",
  back: "Back to your details",
  step: "Step {n} of 2",
  successTitle: "You're all set! Your enquiry is on its way.",
};

export type EnquiryStagesCopy = typeof enquiryStagesCopy;
