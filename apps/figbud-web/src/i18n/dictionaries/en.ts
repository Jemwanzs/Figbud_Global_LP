/**
 * English is the source language. Every other locale overlays a partial
 * translation on top of this dictionary; missing keys fall back to English.
 *
 * Content rules: no unverified statistics, customer names or regulatory
 * claims. Product demonstrations use synthetic data and say so.
 */
const en = {
  meta: {
    siteName: "FigBud Global",
    title: "FigBud Global — Enterprise software built for complexity",
    description:
      "Configurable enterprise platforms for people, lending and spend: ZiraHR, Jasiri LMS, Expense Now and Ziwa LMS. Built in Kenya, designed for Africa.",
  },
  common: {
    skipToContent: "Skip to content",
    breadcrumb: "Breadcrumb",
    nav: {
      label: "Main",
      home: "Home",
      products: "Products",
      about: "About Us",
      blog: "Blog",
      contact: "Contact",
    },
    productsMenu: {
      title: "Our platforms",
      viewAll: "View all products",
    },
    cta: {
      letsTalk: "Let's Talk",
      exploreProducts: "Explore Our Products",
      talkToTeam: "Talk to Our Team",
      visitSite: "Visit {product}",
      joinWaitlist: "Join the waitlist",
      requestDemo: "Request a demo",
    },
    status: {
      active: "Active",
      coming_soon: "Coming soon",
      planned: "Planned",
    },
    theme: { toLight: "Switch to light theme", toDark: "Switch to dark theme" },
    language: {
      label: "Language",
      inReview: "In review",
    },
    menu: {
      open: "Open menu",
      close: "Close menu",
    },
    opensInNewTab: "opens in a new tab",
    syntheticData: "Illustrative product activity · synthetic data",
    draftNotice: "This translation is being reviewed. Some content is shown in English.",
  },
  products: {
    zirahr: {
      category: "People technology",
      // The official ZiraHR slogan (owner, 30 Oct 2026).
      tagline: "HR Simplified. Business Amplified.",
      summary:
        "Workforce operations, compliant payroll, approvals and intelligence in one configurable platform.",
      highlights: [
        "Employee 360 from onboarding to exit",
        "Rules-based, effective-dated payroll",
        "Leave, attendance and approvals that flow",
      ],
    },
    jasiri: {
      category: "Lending technology",
      tagline: "Every loan. Every decision. Connected.",
      summary:
        "From origination and credit assessment to disbursement, collections and portfolio intelligence.",
      highlights: [
        "Individual, business, group and check-off lending",
        "Configurable products, approvals and maker-checker",
        "Collections and portfolio health in real time",
      ],
    },
    expense_now: {
      category: "Expenses & payments",
      tagline: "Spend smarter. Move money better.",
      summary: "Expense controls, payment workflows, approvals and multicurrency financial operations.",
      highlights: [
        "Requests, budgets and reimbursements",
        "Configurable, segregated approvals",
        "Payment orchestration and reconciliation",
      ],
    },
    ziwa: {
      category: "Lending operations",
      tagline: "Lending that flows with your business.",
      summary:
        "From application to repayment, Ziwa brings your lending operations together in one intelligent, configurable platform.",
      highlights: [
        "One guided journey from onboarding to repayment",
        "Products, fees and repayment schedules you configure",
        "Top-ups, restructures and arrears handled in one place",
      ],
    },
  },
  home: {
    hero: {
      eyebrow: "From vision to value, we deliver",
      titleLead: "Built for complexity.",
      titleAccent: "Designed for progress.",
      lead: "Enterprise technology that moves business forward. Configurable. Reliable. Ready to scale.",
      pillars: ["Built in Kenya", "Multilingual & multicurrency by design", "Secure by architecture"],
      visual: {
        label:
          "The FigBud ecosystem: ZiraHR, Jasiri LMS, Expense Now and Ziwa LMS connected through one core.",
        core: "FigBud core",
        coreDetail: "Identity · Workflows · Data",
        explore: "Explore {product}",
        feedTitle: "Live across the ecosystem",
        live: "Live",
        events: [
          { product: "zirahr", text: "Payroll run approved", meta: "412 employees" },
          { product: "jasiri", text: "Loan JL-20418 disbursed", meta: "Mobile money" },
          { product: "zirahr", text: "Leave request routed", meta: "Manager → HR" },
          { product: "jasiri", text: "Credit decision returned", meta: "Policy v3.2" },
          { product: "expense_now", text: "Expense claim matched", meta: "Preview" },
          { product: "zirahr", text: "Clock-in verified", meta: "Nairobi branch" },
        ],
      },
    },
    platforms: {
      eyebrow: "Our platforms",
      title: "Distinct platforms. One connected ecosystem.",
      lead: "Each FigBud platform is a complete product with its own website, built on a shared foundation of configurable workflows, security and data.",
      tabsLabel: "Choose a platform",
      previewLabel: "{product} preview",
      waitlistNote: "{product} is in development. Join the waitlist to hear first when it opens.",
      previews: {
        zirahr: {
          title: "Payroll · October run",
          gross: "Gross pay",
          net: "Net pay",
          deductions: "Statutory deductions",
          deductionItems: ["PAYE", "SHIF", "NSSF", "Housing levy"],
          steps: ["Drafted", "Reviewed", "Approved", "Processed"],
          leave: "Leave request",
          leaveDetail: "Annual leave · 5 days",
          leaveStatus: "Awaiting manager",
        },
        jasiri: {
          title: "Loan portfolio · this month",
          pipeline: ["Applications", "Assessment", "Approval", "Disbursed"],
          parLabel: "Portfolio at risk (30+)",
          collections: "Collections rate",
          schedule: "Repayment schedule",
          scheduleDetail: "12 months · monthly",
        },
        expense_now: {
          title: "Spend vs budget · Q4",
          categories: ["Travel", "Software", "Operations", "Marketing"],
          approvals: "Approval chain",
          approvalSteps: ["Requester", "Manager", "Finance", "Paid"],
          batch: "Vendor payment batch",
          batchDetail: "18 payments · 3 currencies",
          comingSoon: "Planned capabilities preview",
        },
        ziwa: {
          title: "Loan flow · today",
          stages: ["Applied", "Verified", "Approved", "Disbursed", "Repaying"],
          servicing: "Servicing queue",
          servicingItems: ["Top-up requests", "Restructure reviews", "Early settlements"],
          rhythm: "Repayment rhythm",
          rhythmDetail: "On-time repayments, last 6 weeks",
          comingSoon: "Planned capabilities preview",
        },
      },
    },
    philosophy: {
      eyebrow: "Our philosophy",
      title: "Software should fit the way you work. So we build it to bend, not break.",
      items: [
        {
          title: "Configurable by design.",
          body: "Policies, workflows, approval levels and rules live in configuration, not code. Your organisation's way of working becomes the product's way of working.",
        },
        {
          title: "Reliable by architecture.",
          body: "Audit trails, idempotent transactions, role-based access and tested calculation engines are the foundation, not features added later.",
        },
        {
          title: "Flexible for growth.",
          body: "New branches, entities, currencies, languages and markets arrive as validated configuration, so growing never means starting again.",
        },
      ],
    },
    africa: {
      eyebrow: "Built for Africa. Ready for everywhere.",
      title: "Kenya is where we start. Not where we stop.",
      lead: "Every platform is engineered with multilingual, multicurrency and jurisdiction-aware foundations. New markets arrive as validated market packs: local statutory rules, payment rails and languages, reviewed before they go live.",
      startingPoint: "Nairobi, Kenya",
      startingPointLabel: "Starting point",
      originTagline: "Where our vision begins.",
      productsLabel: "FigBud products",
      mapLabel:
        "Map of Africa showing Nairobi as FigBud's starting point, with illustrative routes to other African markets.",
      mapNote: "Routes are illustrative of our expansion architecture, not current operations.",
      facts: [
        { label: "Languages", value: "English, Kiswahili, Français, العربية, 中文" },
        { label: "Currencies", value: "KES first, multicurrency by design" },
        { label: "Compliance", value: "Market packs validated per jurisdiction" },
      ],
    },
    engineer: {
      eyebrow: "What we engineer",
      title: "The hard parts, handled.",
      lead: "Underneath every FigBud product is the same disciplined engineering: the capabilities that make enterprise software trustworthy.",
      items: [
        {
          key: "workflow",
          title: "Workflow automation",
          body: "Multi-level approvals, delegation, escalations and maker-checker controls, configured per organisation.",
        },
        {
          key: "finance",
          title: "Financial intelligence",
          body: "Effective-dated calculation engines for payroll, interest, fees and spend, built to be tested and explained.",
        },
        {
          key: "integrations",
          title: "Integrations",
          body: "Banks, mobile money, accounting and identity systems connected through documented, versioned APIs.",
        },
        {
          key: "security",
          title: "Data security",
          body: "Tenant isolation, role-based access, encryption and complete audit trails, designed around data-protection law.",
        },
        {
          key: "analytics",
          title: "Analytics",
          body: "Operational dashboards and portfolio intelligence that turn daily transactions into decisions.",
        },
      ],
      workflow: {
        title: "Approval workflow",
        subtitle: "Purchase request · KES 1.2M",
        steps: [
          { label: "Request submitted", meta: "Operations" },
          { label: "Policy check passed", meta: "Rule: > KES 1M" },
          { label: "Manager approved", meta: "Level 1" },
          { label: "Finance approved", meta: "Level 2" },
          { label: "Completed", meta: "Audit trail saved" },
        ],
        replay: "Replay workflow",
      },
    },
    company: {
      eyebrow: "About FigBud",
      title: "Technology should adapt to your business. Not the other way around.",
      body: "FigBud Global is an African technology company building enterprise software for organisations whose operations are too important for generic tools.",
      cta: "More about FigBud",
      insightsTitle: "Insights",
      insightsLead: "Practical thinking on the work our platforms do.",
      topics: [
        { title: "Payroll & compliance", body: "Statutory change, explained for HR and finance teams." },
        { title: "Lending technology", body: "Credit, collections and portfolio health." },
        { title: "Finance operations", body: "Spend control, payments and reconciliation." },
        { title: "Product updates", body: "What's new across the FigBud ecosystem." },
      ],
      insightsCta: "Visit the blog",
    },
    finalCta: {
      titleLead: "Complex business?",
      titleAccent: "Meet simpler technology.",
      lead: "Tell us how your organisation works. We'll show you how our platforms fit.",
    },
  },
  footer: {
    cookieSettings: "Cookie settings",
    tagline: "Enterprise software. Intelligent automation. Digital infrastructure.",
    origin: "Built in Kenya. Designed for Africa. Engineered to scale.",
    productsTitle: "Products",
    companyTitle: "Company",
    legalTitle: "Legal",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    cookies: "Cookie Policy",
    rights: "All rights reserved.",
  },
  consent: {
    labels: {
      region: "Cookie consent",
      acceptAll: "Accept all",
      rejectOptional: "Reject optional",
      customize: "Customize",
      save: "Save choices",
      preferencesTitle: "Cookie preferences",
      preferencesIntro:
        "Choose which optional cookies we may use. You can change your mind at any time from “Cookie settings” at the bottom of every page.",
      alwaysOn: "Always on",
      privacyPolicy: "Privacy Policy",
      cookiePolicy: "Cookie Policy",
      close: "Close",
    },
    // Shown on other languages' pages; English pages show the Studio's text.
    banner: {
      title: "Your privacy matters",
      body: "We use essential cookies to keep our website working. With your permission, we may also use optional cookies to understand website usage and improve your experience.",
    },
    categories: {
      necessary: {
        label: "Strictly necessary",
        description:
          "Keep the website working and secure: they remember your cookie choices, your theme and your language, and protect forms from abuse. Always on.",
      },
      analytics: {
        label: "Analytics",
        description:
          "Help us understand how the website is used, such as which pages are visited, so we can improve it.",
      },
      preferences: {
        label: "Preferences",
        description: "Remember optional personal settings beyond the essentials, to tailor your experience.",
      },
      marketing: {
        label: "Marketing",
        description: "Measure the reach of our marketing and show relevant FigBud content on other websites.",
      },
    },
  },
  pages: {
    products: {
      title: "Products",
      description: "Explore the FigBud ecosystem: ZiraHR, Jasiri LMS, Expense Now and Ziwa LMS.",
      lead: "Configurable enterprise platforms for people, lending and spend. Each product has its own dedicated website.",
      compare: {
        title: "The ecosystem at a glance",
        lead: "Distinct platforms, one design philosophy: configurable, reliable and ready to scale.",
        caption: "Comparison of FigBud products",
        rows: { category: "Built for", summary: "What it does", status: "Availability", next: "Next step" },
      },
      future: {
        eyebrow: "What's next",
        title: "More platforms in the making",
        body: "New FigBud platforms join this page as they launch. If your organisation has an operational problem worth solving, or you would like to partner with us, we would like to hear from you.",
        cta: "Start a conversation",
      },
    },
    about: {
      title: "About Us",
      description: "FigBud Global builds configurable enterprise software in Kenya, for Africa and beyond.",
      lead: "Technology should adapt to your business. Not the other way around.",
      slogan: "One Vision. Endless Solutions.",
      whoEyebrow: "Who we are",
      beliefEyebrow: "What we believe",
      buildEyebrow: "What we build",
      buildTitle: "Distinct platforms for the work that matters most.",
      buildLead: "Each product is a complete platform with its own website, built on one shared foundation.",
      productLink: "Explore {product}",
    },
    blog: {
      title: "Blog & Insights",
      description:
        "Insights on payroll, compliance, lending technology and finance operations from FigBud Global.",
      lead: "Practical thinking on payroll, lending, finance operations and the technology behind them.",
      eyebrow: "Insights",
      searchLabel: "Search articles",
      searchPlaceholder: "Search insights…",
      searchButton: "Search",
      topicsLabel: "Topics",
      allTopics: "All topics",
      taggedWith: "Tagged “{tag}”",
      resultsFor: "Results for “{q}”",
      clearFilters: "Clear filters",
      emptyTitle: "Insights are on their way",
      emptyBody:
        "We're preparing practical articles on payroll, lending and finance operations. In the meantime, explore our platforms or talk to our team.",
      noResultsTitle: "No articles match",
      noResultsBody: "Try a different search term or topic.",
      unavailableTitle: "Insights are temporarily unavailable",
      unavailableBody: "We couldn't load articles just now. Please try again shortly.",
      readingTime: "{minutes} min read",
      byAuthor: "By {author}",
      pagination: "Pagination",
      previous: "Previous",
      next: "Next",
      pageOf: "Page {page} of {total}",
      backToBlog: "All insights",
      onThisPage: "On this page",
      related: "Related insights",
      updated: "Updated {date}",
    },
    contact: {
      title: "Contact",
      description: "Talk to FigBud Global about ZiraHR, Jasiri LMS, Expense Now, Ziwa LMS or partnerships.",
      lead: "Tell us about your organisation and what you're looking for. The right team will get back to you.",
      eyebrow: "Let's talk",
      nextTitle: "What happens next",
      nextSteps: [
        {
          title: "We read every enquiry",
          body: "Your message goes straight to the team responsible for the product you choose.",
        },
        {
          title: "We confirm by email",
          body: "You'll receive a reference number so you can follow up at any time.",
        },
        {
          title: "We tailor the conversation",
          body: "Demos are shaped around your organisation's workflows, not a generic script.",
        },
      ],
      privacyNote: "We only use these details to respond to your enquiry.",
    },
    privacy: { title: "Privacy Policy", description: "How FigBud Global handles personal data." },
    terms: { title: "Terms of Use", description: "Terms governing use of the FigBud Global website." },
    cookies: {
      title: "Cookie Policy",
      description: "How the FigBud Global website uses cookies.",
      inventory: {
        title: "Cookies on this website",
        lead: "Strictly necessary cookies are always on. Optional cookies are used only if you allow them, and you can change your choice at any time.",
        name: "Name",
        kind: "Type",
        purpose: "Purpose",
        duration: "Kept for",
        cookie: "Cookie",
        storage: "Browser storage",
        necessary: "Strictly necessary",
        consentPurpose: "Remembers your cookie choices: an anonymous ID and the categories you allowed.",
        localePurpose: "Remembers the language you chose.",
        themePurpose: "Remembers whether you chose the light or dark theme.",
        campaignPurpose:
          "Remembers that you closed or already saw a promotion, so it isn't shown again too often.",
        perVisit: "Until the end of your visit, or as the promotion's frequency sets",
        days: "{n} days",
        year: "1 year",
        untilCleared: "Until you clear it",
        optionalTitle: "Optional services",
        noOptional: "No analytics or marketing services are in use at the moment.",
        optionalPurpose: "Loads only if you allow {category} cookies.",
        manage: "Cookie settings",
      },
    },
    inProgress: {
      eyebrow: "In progress",
      body: "This page is being prepared and will be published after review.",
      back: "Back to home",
    },
    legalPending:
      "This policy is being finalised with legal counsel and will be published here before launch. For privacy questions in the meantime, please use the contact form.",
    notFound: {
      title: "This page took a different route.",
      body: "The page you're looking for doesn't exist or has moved.",
      home: "Go to the homepage",
      products: "Explore our products",
    },
  },
  form: {
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
  },
};

export default en;
export type Dictionary = typeof en;
