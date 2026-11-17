// Starter task templates (from the approved mockup, based on the FUB checklists). Seeded once into an
// empty TaskTemplate table; edit them in Admin → Task templates. Status names are matched at seed time.
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: "New lead follow-up", trigger: null, advanceKind: "listing",
    phases: [
      { id: "p1", name: "First contact", steps: [
        {"id":"s2","name":"Call new lead","assignee":"Luke","type":"call","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s3","name":"Intro email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always","message":"Website sign-up welcome"},
        {"id":"s4","name":"Schedule consult","assignee":"Luke","type":"task","days":2,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
  {
    name: "Phone call booked", trigger: "phonecall", advanceKind: "listing",
    phases: [
      { id: "p5", name: "Phone call", steps: [
        {"id":"s6","name":"Initial phone call scheduled email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always","message":"Initial phone call scheduled"},
        {"id":"s7","name":"Call reminder text","assignee":"Alyssa","type":"text","days":0,"dir":"on","anchor":"phoneCall","cond":"always"},
        {"id":"s8","name":"Hold phone call","assignee":"Luke","type":"call","days":0,"dir":"on","anchor":"phoneCall","cond":"always"},
        {"id":"s9","name":"Schedule consult and start buyer or listing","assignee":"Alyssa","type":"task","days":1,"dir":"after","anchor":"phoneCall","cond":"always"},
      ] },
    ],
  },
  {
    name: "Buyer · Consult scheduled", trigger: {"status":{"kind":"buyer","name":"Consult scheduled"}}, advanceKind: "buyer",
    phases: [
      { id: "p10", name: "Before the consult", steps: [
        {"id":"s11","name":"Agency disclosure + more info email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s12","name":"Consult confirmation text","assignee":"Luke","type":"text","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s13","name":"Hold consult","assignee":"Luke","type":"task","days":2,"dir":"after","anchor":"start","cond":"always","advanceName":"Consult complete"},
      ] },
    ],
  },
  {
    name: "Buyer · Consult complete", trigger: {"status":{"kind":"buyer","name":"Consult complete"}}, advanceKind: "buyer",
    phases: [
      { id: "p14", name: "After the consult", steps: [
        {"id":"s15","name":"Intro + Homespotter + legal name text","assignee":"Alyssa","type":"text","days":0,"dir":"on","anchor":"start","cond":"always","message":"Intro + Homespotter + legal name"},
        {"id":"s16","name":"Buyer rep breakdown email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always","message":"Buyer rep breakdown"},
        {"id":"s17","name":"Connect with lender?","assignee":"Luke","type":"task","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s18","name":"Send buyer rep to sign","assignee":"Alyssa","type":"task","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s19","name":"Buyer rep signed + saved","assignee":"Alyssa","type":"task","days":3,"dir":"after","anchor":"start","cond":"always","advanceName":"Rep signed"},
      ] },
    ],
  },
  {
    name: "Buyer · Rep signed", trigger: {"status":{"kind":"buyer","name":"Rep signed"}}, advanceKind: "buyer",
    phases: [
      { id: "p20", name: "Buyer rep", steps: [
        {"id":"s21","name":"Email signed rep to clients","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s22","name":"Rename Gmail folder","assignee":"Alyssa","type":"task","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s23","name":"Set up home search","assignee":"Luke","type":"task","days":1,"dir":"after","anchor":"start","cond":"always","advanceName":"Showing homes"},
      ] },
    ],
  },
  {
    name: "Buyer · Showing homes", trigger: {"status":{"kind":"buyer","name":"Showing homes"}}, advanceKind: "buyer",
    phases: [
      { id: "p24", name: "Showing homes", steps: [
        {"id":"s25","name":"Check in on showings","assignee":"Luke","type":"call","days":7,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s26","name":"Buyer rep check-in","assignee":"Luke","type":"call","days":30,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
  {
    name: "Buyer · Submitting offers", trigger: {"status":{"kind":"buyer","name":"Submitting offers"}}, advanceKind: "buyer",
    phases: [
      { id: "p27", name: "Offer", steps: [
        {"id":"s28","name":"Purchase agreement breakdown email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s29","name":"Offer sent to sign","assignee":"Luke","type":"task","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s30","name":"Lead-paint pamphlet email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"pre1978"},
        {"id":"s31","name":"Follow up with listing agent","assignee":"Luke","type":"call","days":1,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
  {
    name: "Listing · Consult scheduled", trigger: {"status":{"kind":"listing","name":"Consult scheduled"}}, advanceKind: "listing",
    phases: [
      { id: "p32", name: "Before the consult", steps: [
        {"id":"s33","name":"Agency disclosure email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s34","name":"Prep CMA","assignee":"Luke","type":"task","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s35","name":"Hold consult","assignee":"Luke","type":"task","days":3,"dir":"after","anchor":"start","cond":"always","advanceName":"Consult complete"},
      ] },
    ],
  },
  {
    name: "Listing · Consult complete", trigger: {"status":{"kind":"listing","name":"Consult complete"}}, advanceKind: "listing",
    phases: [
      { id: "p36", name: "After the consult", steps: [
        {"id":"s37","name":"CMA + net sheet email","assignee":"Luke","type":"email","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s38","name":"Intro text with assistant","assignee":"Alyssa","type":"text","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s39","name":"Send listing agreement to sign","assignee":"Alyssa","type":"task","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s40","name":"Listing agreement signed + saved","assignee":"Alyssa","type":"task","days":3,"dir":"after","anchor":"start","cond":"always","advanceName":"Listing signed / Prep"},
      ] },
    ],
  },
  {
    name: "Buyer · Under contract", trigger: "pa:buyer", advanceKind: "buyer",
    phases: [
      { id: "p41", name: "Under Contract", steps: [
        {"id":"s42","name":"Purchase agreement accepted email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"finalAcceptance","cond":"always","message":"Purchase agreement accepted"},
        {"id":"s43","name":"Lender intro email","assignee":"Luke","type":"email","days":0,"dir":"on","anchor":"finalAcceptance","cond":"always"},
        {"id":"s44","name":"Request earnest money","assignee":"Alyssa","type":"text","days":1,"dir":"after","anchor":"finalAcceptance","cond":"always","message":"Earnest money"},
        {"id":"s45","name":"Lead-paint pamphlet email","assignee":"Alyssa","type":"email","days":1,"dir":"after","anchor":"finalAcceptance","cond":"pre1978"},
      ] },
      { id: "p46", name: "Inspection", steps: [
        {"id":"s47","name":"Schedule inspection","assignee":"Luke","type":"task","days":1,"dir":"after","anchor":"finalAcceptance","cond":"always"},
        {"id":"s48","name":"Day-of-inspection text","assignee":"Alyssa","type":"text","days":3,"dir":"before","anchor":"inspection","cond":"always","message":"Day-of-inspection"},
        {"id":"s49","name":"Review inspection report with clients","assignee":"Luke","type":"task","days":2,"dir":"before","anchor":"inspection","cond":"always"},
        {"id":"s50","name":"Signed amendment to lender + title","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"inspection","cond":"always"},
      ] },
      { id: "p51", name: "Financing", steps: [
        {"id":"s52","name":"Remind lender about written statement","assignee":"Alyssa","type":"email","days":2,"dir":"before","anchor":"writtenStatement","cond":"always"},
      ] },
      { id: "p53", name: "HOA", steps: [
        {"id":"s54","name":"Send HOA docs to clients","assignee":"Alyssa","type":"email","days":4,"dir":"after","anchor":"finalAcceptance","cond":"hoa"},
        {"id":"s55","name":"Confirm rescission period ended","assignee":"Alyssa","type":"task","days":0,"dir":"on","anchor":"hoaRescission","cond":"hoa"},
      ] },
      { id: "p56", name: "Closing", steps: [
        {"id":"s57","name":"Order closing gift","assignee":"Luke","type":"task","days":14,"dir":"before","anchor":"closing","cond":"always"},
        {"id":"s58","name":"Final walkthrough","assignee":"Luke","type":"task","days":1,"dir":"before","anchor":"closing","cond":"always"},
        {"id":"s59","name":"Closing day","assignee":"Luke","type":"task","days":0,"dir":"on","anchor":"closing","cond":"always"},
      ] },
    ],
  },
  {
    name: "Buyer · Post-close", trigger: "closed:buyer", advanceKind: "buyer",
    phases: [
      { id: "p60", name: "Post-close", steps: [
        {"id":"s65","name":"Update tags for a past client","assignee":"Alyssa","type":"tags","days":0,"dir":"on","anchor":"start","cond":"always","addTags":["Past Client","Email Newsletter","Mailers","Petty Homes Event List","Real Estate Health Check"],"removeTags":["Buyer","Under contract"]},
        {"id":"s61","name":"\"How was the move?\" text","assignee":"Luke","type":"text","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s62","name":"Thank-you card","assignee":"Luke","type":"task","days":3,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s63","name":"Zillow review request","assignee":"Alyssa","type":"text","days":5,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s64","name":"Google review request","assignee":"Alyssa","type":"email","days":21,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
  {
    name: "Listing · Prep", trigger: {"status":{"kind":"listing","name":"Listing signed / Prep"}}, advanceKind: "listing",
    phases: [
      { id: "p66", name: "Prep", steps: [
        {"id":"s67","name":"Withhold listing in MLS","assignee":"Alyssa","type":"task","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s68","name":"Schedule photos","assignee":"Alyssa","type":"task","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s69","name":"Drop off lockbox","assignee":"Luke","type":"task","days":2,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s70","name":"Disclosures + lead paint","assignee":"Alyssa","type":"task","days":3,"dir":"after","anchor":"start","cond":"pre1978"},
      ] },
      { id: "p71", name: "Media", steps: [
        {"id":"s72","name":"Photos to clients","assignee":"Alyssa","type":"email","days":5,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s73","name":"Upload to MLS","assignee":"Alyssa","type":"task","days":6,"dir":"after","anchor":"start","cond":"always","advanceName":"Coming soon"},
      ] },
    ],
  },
  {
    name: "Listing · Coming soon", trigger: {"status":{"kind":"listing","name":"Coming soon"}}, advanceKind: "listing",
    phases: [
      { id: "p74", name: "Launch", steps: [
        {"id":"s75","name":"Showing instructions","assignee":"Alyssa","type":"task","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s76","name":"Coming-soon email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s77","name":"Sign install","assignee":"Luke","type":"task","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s78","name":"Go active in MLS","assignee":"Alyssa","type":"task","days":4,"dir":"after","anchor":"start","cond":"always","advanceName":"Active"},
      ] },
    ],
  },
  {
    name: "Seller · Under contract", trigger: "pa:seller", advanceKind: "listing",
    phases: [
      { id: "p79", name: "Under Contract", steps: [
        {"id":"s80","name":"Mark contingent in MLS","assignee":"Alyssa","type":"task","days":0,"dir":"on","anchor":"finalAcceptance","cond":"always"},
        {"id":"s81","name":"Purchase agreement accepted email","assignee":"Alyssa","type":"email","days":0,"dir":"on","anchor":"finalAcceptance","cond":"always","message":"Purchase agreement accepted"},
      ] },
      { id: "p82", name: "Closing", steps: [
        {"id":"s83","name":"Closing reminder email","assignee":"Alyssa","type":"email","days":14,"dir":"before","anchor":"closing","cond":"always"},
        {"id":"s84","name":"Closing day","assignee":"Luke","type":"task","days":0,"dir":"on","anchor":"closing","cond":"always"},
      ] },
    ],
  },
  {
    name: "Listing · Active", trigger: {"status":{"kind":"listing","name":"Active"}}, advanceKind: "listing",
    phases: [
      { id: "p85", name: "On the market", steps: [
        {"id":"s86","name":"Check showing feedback","assignee":"Alyssa","type":"task","days":3,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s87","name":"Weekly seller update","assignee":"Luke","type":"email","days":7,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s88","name":"Price review with sellers","assignee":"Luke","type":"call","days":14,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
  {
    name: "Seller · Post-close", trigger: "closed:seller", advanceKind: "listing",
    phases: [
      { id: "p89", name: "Post-close", steps: [
        {"id":"s93","name":"Update tags for a past client","assignee":"Alyssa","type":"tags","days":0,"dir":"on","anchor":"start","cond":"always","addTags":["Past Client","Email Newsletter","Mailers","Petty Homes Event List","Real Estate Health Check"],"removeTags":["Seller","Under contract"]},
        {"id":"s90","name":"Mark closed in MLS","assignee":"Alyssa","type":"task","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s91","name":"Thank-you card","assignee":"Luke","type":"task","days":3,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s92","name":"Zillow review request","assignee":"Alyssa","type":"text","days":7,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
  {
    name: "Open house follow-up", trigger: null, advanceKind: "listing",
    phases: [
      { id: "p94", name: "Follow-up", steps: [
        {"id":"s95","name":"Thanks for coming text","assignee":"Alyssa","type":"text","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s96","name":"Send similar listings","assignee":"Alyssa","type":"email","days":1,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s97","name":"Follow-up call","assignee":"Luke","type":"call","days":3,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
  {
    name: "Past client yearly check-in", trigger: null, advanceKind: "listing",
    phases: [
      { id: "p98", name: "Check-in", steps: [
        {"id":"s99","name":"Real estate health check call","assignee":"Luke","type":"call","days":0,"dir":"on","anchor":"start","cond":"always"},
        {"id":"s100","name":"Send home value update","assignee":"Alyssa","type":"email","days":2,"dir":"after","anchor":"start","cond":"always"},
        {"id":"s101","name":"Add to holiday card list","assignee":"Alyssa","type":"task","days":2,"dir":"after","anchor":"start","cond":"always"},
      ] },
    ],
  },
];

export type StarterTemplate = { name: string; trigger: string | null | { status: { kind: string; name: string } }; advanceKind: string; phases: { id: string; name: string; steps: Record<string, unknown>[] }[] };
