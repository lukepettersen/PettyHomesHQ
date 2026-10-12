// Shared between mockup pages: task templates (edited in Admin, applied from
// contact pages) and a hand-off queue of new tasks for the Tasks page.
window.HQ = window.HQ || (() => {
  const s = (name, anchor, days, dir, who, type, extra = {}) => Object.assign({ name, anchor, days, dir, who, type, tpl: "", cond: "Always", advance: "" }, extra);
  let n = 0; const T = (name, trigger, phases) => ({ id: "t" + (++n), name, trigger, phases });
  return {
    newTasks: [],
    templates: [
      T("New lead follow-up", "", [{ name: "First contact", steps: [s("Call new lead", "Start date", 0, "on", "Luke", "Call"), s("Intro email", "Start date", 0, "on", "Alyssa", "Email", { tpl: "Website sign-up welcome" }), s("Schedule consult", "Start date", 2, "after", "Luke", "Task")] }]),
      T("Phone call booked", "", [{ name: "Phone call", steps: [s("Initial phone call scheduled email", "Start date", 0, "on", "Alyssa", "Email", { tpl: "Initial phone call scheduled" }), s("Add call to Luke's calendar", "Start date", 0, "on", "Alyssa", "Task"), s("Hold phone call", "Start date", 1, "after", "Luke", "Call"), s("Schedule consult and start buyer or listing", "Start date", 1, "after", "Alyssa", "Task")] }]),
      T("Buyer · Consult scheduled", "Buyer · Consult scheduled", [{ name: "Before the consult", steps: [s("Agency disclosure + more info email", "Start date", 0, "on", "Alyssa", "Email"), s("Consult confirmation text", "Start date", 1, "after", "Luke", "Text"), s("Hold consult", "Start date", 2, "after", "Luke", "Task", { advance: "Consult complete" })] }]),
      T("Buyer · Consult complete", "Buyer · Consult complete", [{ name: "After the consult", steps: [s("Intro + Homespotter + legal name text", "Start date", 0, "on", "Alyssa", "Text", { tpl: "Intro + Homespotter + legal name" }), s("Buyer rep breakdown email", "Start date", 0, "on", "Alyssa", "Email", { tpl: "Buyer rep breakdown" }), s("Connect with lender?", "Start date", 1, "after", "Luke", "Task"), s("Send buyer rep to sign", "Start date", 1, "after", "Alyssa", "Task"), s("Buyer rep signed + saved", "Start date", 3, "after", "Alyssa", "Task", { advance: "Rep signed" })] }]),
      T("Buyer · Rep signed", "Buyer · Rep signed", [{ name: "Buyer rep", steps: [s("Email signed rep to clients", "Start date", 0, "on", "Alyssa", "Email"), s("Rename Gmail folder", "Start date", 0, "on", "Alyssa", "Task"), s("Set up home search", "Start date", 1, "after", "Luke", "Task", { advance: "Showing homes" })] }]),
      T("Buyer · Showing homes", "Buyer · Showing homes", [{ name: "Showing homes", steps: [s("Check in on showings", "Start date", 7, "after", "Luke", "Call"), s("Buyer rep check-in", "Start date", 30, "after", "Luke", "Call")] }]),
      T("Buyer · Submitting offers", "Buyer · Submitting offers", [{ name: "Offer", steps: [s("Purchase agreement breakdown email", "Start date", 0, "on", "Alyssa", "Email"), s("Offer sent to sign", "Start date", 0, "on", "Luke", "Task"), s("Lead-paint pamphlet email", "Start date", 0, "on", "Alyssa", "Email", { cond: "Built before 1978" }), s("Follow up with listing agent", "Start date", 1, "after", "Luke", "Call")] }]),
      T("Listing · Consult scheduled", "Listing · Consult scheduled", [{ name: "Before the consult", steps: [s("Agency disclosure email", "Start date", 0, "on", "Alyssa", "Email"), s("Prep CMA", "Start date", 1, "after", "Luke", "Task"), s("Hold consult", "Start date", 3, "after", "Luke", "Task", { advance: "Consult complete" })] }]),
      T("Listing · Consult complete", "Listing · Consult complete", [{ name: "After the consult", steps: [s("CMA + net sheet email", "Start date", 0, "on", "Luke", "Email"), s("Intro text with assistant", "Start date", 0, "on", "Alyssa", "Text"), s("Send listing agreement to sign", "Start date", 1, "after", "Alyssa", "Task"), s("Listing agreement signed + saved", "Start date", 3, "after", "Alyssa", "Task", { advance: "Listing signed / Prep" })] }]),
      T("Buyer · Under contract", "Buyer · Under contract", [
        { name: "Under Contract", steps: [s("Purchase agreement accepted email", "Final Acceptance", 0, "on", "Alyssa", "Email", { tpl: "Purchase agreement accepted" }), s("Lender intro email", "Final Acceptance", 0, "on", "Luke", "Email"), s("Request earnest money", "Final Acceptance", 1, "after", "Alyssa", "Text", { tpl: "Earnest money" }), s("Lead-paint pamphlet email", "Final Acceptance", 1, "after", "Alyssa", "Email", { cond: "Built before 1978" })] },
        { name: "Inspection", steps: [s("Schedule inspection", "Final Acceptance", 1, "after", "Luke", "Task"), s("Day-of-inspection text", "Inspection", 3, "before", "Alyssa", "Text", { tpl: "Day-of-inspection" }), s("Review inspection report with clients", "Inspection", 2, "before", "Luke", "Task"), s("Signed amendment to lender + title", "Inspection", 0, "on", "Alyssa", "Email")] },
        { name: "Financing", steps: [s("Remind lender about written statement", "Written Statement", 2, "before", "Alyssa", "Email")] },
        { name: "HOA", steps: [s("Send HOA docs to clients", "Final Acceptance", 4, "after", "Alyssa", "Email", { cond: "HOA property" }), s("Confirm rescission period ended", "HOA Rescission", 0, "on", "Alyssa", "Task", { cond: "HOA property" })] },
        { name: "Closing", steps: [s("Order closing gift", "Closing", 14, "before", "Luke", "Task"), s("Final walkthrough", "Closing", 1, "before", "Luke", "Task"), s("Closing day", "Closing", 0, "on", "Luke", "Task", { advance: "Closed" })] },
      ]),
      T("Buyer · Post-close", "Buyer · Closed", [{ name: "Post-close", steps: [s("\"How was the move?\" text", "Start date", 1, "after", "Luke", "Text"), s("Thank-you card", "Start date", 3, "after", "Luke", "Task"), s("Zillow review request", "Start date", 5, "after", "Alyssa", "Text"), s("Google review request", "Start date", 21, "after", "Alyssa", "Email")] }]),
      T("Listing · Prep", "Listing · Listing signed / Prep", [{ name: "Prep", steps: [s("Withhold listing in MLS", "Start date", 0, "on", "Alyssa", "Task"), s("Schedule photos", "Start date", 1, "after", "Alyssa", "Task"), s("Drop off lockbox", "Start date", 2, "after", "Luke", "Task"), s("Disclosures + lead paint", "Start date", 3, "after", "Alyssa", "Task", { cond: "Built before 1978" })] }, { name: "Media", steps: [s("Photos to clients", "Start date", 5, "after", "Alyssa", "Email"), s("Upload to MLS", "Start date", 6, "after", "Alyssa", "Task", { advance: "Coming soon" })] }]),
      T("Listing · Coming soon", "Listing · Coming soon", [{ name: "Launch", steps: [s("Showing instructions", "Start date", 0, "on", "Alyssa", "Task"), s("Coming-soon email", "Start date", 0, "on", "Alyssa", "Email"), s("Sign install", "Start date", 1, "after", "Luke", "Task"), s("Go active in MLS", "Start date", 4, "after", "Alyssa", "Task", { advance: "Active" })] }]),
      T("Seller · Under contract", "Seller · Under contract", [{ name: "Under Contract", steps: [s("Mark contingent in MLS", "Final Acceptance", 0, "on", "Alyssa", "Task"), s("Purchase agreement accepted email", "Final Acceptance", 0, "on", "Alyssa", "Email", { tpl: "Purchase agreement accepted" })] }, { name: "Closing", steps: [s("Closing reminder email", "Closing", 14, "before", "Alyssa", "Email"), s("Closing day", "Closing", 0, "on", "Luke", "Task", { advance: "Closed" })] }]),
      T("Listing · Active", "Listing · Active", [{ name: "On the market", steps: [s("Check showing feedback", "Start date", 3, "after", "Alyssa", "Task"), s("Weekly seller update", "Start date", 7, "after", "Luke", "Email"), s("Price review with sellers", "Start date", 14, "after", "Luke", "Call")] }]),
      T("Seller · Post-close", "Seller · Closed", [{ name: "Post-close", steps: [s("Mark closed in MLS", "Start date", 0, "on", "Alyssa", "Task"), s("Thank-you card", "Start date", 3, "after", "Luke", "Task"), s("Zillow review request", "Start date", 7, "after", "Alyssa", "Text")] }]),
      T("Open house follow-up", "", [{ name: "Follow-up", steps: [s("Thanks for coming text", "Start date", 0, "on", "Alyssa", "Text"), s("Send similar listings", "Start date", 1, "after", "Alyssa", "Email"), s("Follow-up call", "Start date", 3, "after", "Luke", "Call")] }]),
      T("Past client yearly check-in", "", [{ name: "Check-in", steps: [s("Real estate health check call", "Start date", 0, "on", "Luke", "Call"), s("Send home value update", "Start date", 2, "after", "Alyssa", "Email"), s("Add to holiday card list", "Start date", 2, "after", "Alyssa", "Task")] }]),
    ],
  };
})();
// Settings every page reads (edited in Admin), plus the people and client files.
// The mockup starts empty: no people, clients, tasks or messages.
window.HQ.settings = window.HQ.settings || {
  stages: ["Sphere", "Past Client", "Lead", "Industry Partners", "Passive Marketing", "Archive", "Trash"],
  sources: ["Sphere", "Sphere Referral", "Website", "Zillow Preferred", "Open House", "Sign Call"],
  follow: ["7", "30", "60", "90", "180"],
  tags: ["Buyer", "Seller", "Past Client", "A Lead", "B Lead", "C Lead", "Email Newsletter", "Mailers", "Christmas Cards"],
  // Purchase agreement forms, one per side. The first section is asked on its own (step 2), the rest after.
  // core: fields the automations and Pipeline read; they can be renamed but not removed.
  paForms: (() => {
    const f = (k, l, t, x = {}) => Object.assign({ k, l, t }, x);
    const PT = ["Single family", "Townhome", "Condo", "Twin home", "Multi-family"];
    const property = () => ({ name: "The property", fields: [f("address", "Address", "text", { ph: "Street, city", req: true, core: true }), f("ptype", "Property type", "choice", { opts: PT, core: true }), f("year", "Year built", "number", { core: true }), f("hoa", "HOA?", "yesno", { core: true }), f("newc", "New construction?", "yesno", { core: true })] });
    const dates = () => ({ name: "Key dates", fields: [f("close", "Close date", "date", { core: true }), f("fa", "Final Acceptance", "date", { core: true }), f("insp", "Inspection deadline", "date", { core: true }), f("ws", "Written Statement", "date-na", { core: true }), f("hoa_d", "HOA doc rescission", "date", { core: true })] });
    const notes = () => ({ name: "Notes", fields: [f("inspAt", "Inspection appointment", "datetime"), f("referral", "Referral fee", "text", { ph: "None, or who and how much" }), f("emTo", "Earnest money to", "text", { ph: "Who holds it" }), f("mdc", "Material defect clause?", "text", { ph: "None, or details" })] });
    const ppl = (name, fields) => ({ name, people: true, fields });
    return {
      buyer: [property(),
        { name: "The contract", fields: [f("price", "Purchase price", "money", { req: true, core: true }), f("em", "Earnest money", "money", { core: true }), f("sc", "Seller contributions", "money", { core: true }), f("comm", "Commission %", "pct", { ph: "e.g. 2.7", core: true }), f("bac", "BAC", "money", { ph: "e.g. 695", core: true })] },
        dates(), notes(),
        ppl("Buyer's lender", [f("lenderName", "Name", "text"), f("lenderEmail", "Email", "text"), f("lenderCo", "Company", "text")]),
        ppl("Buyer's title", [f("btitleCo", "Title company", "text"), f("btitleContact", "Contact name", "text"), f("btitleInfo", "Email / phone", "text")]),
        ppl("Seller's agent", [f("saName", "Name", "text"), f("saEmail", "Email", "text")]),
        ppl("Seller's TC", [f("stcName", "Name", "text"), f("stcInfo", "Email / phone", "text")]),
        ppl("Seller's title", [f("stitleCo", "Title company", "text"), f("stitleContact", "Contact, email / phone", "text")])],
      seller: [property(),
        { name: "The contract", fields: [f("price", "Purchase price", "money", { req: true, core: true }), f("em", "Earnest money", "money", { core: true }), f("sc", "Seller contributions", "money", { core: true }), f("fin", "Buyer's financing", "choice", { opts: ["Conventional", "FHA", "VA", "Cash", "Other"], core: true }), f("comm", "Commission %", "pct", { ph: "e.g. 2.5", core: true }), f("bac", "BAC", "money", { core: true })] },
        dates(), notes(),
        ppl("Buyer's agent", [f("baName", "Name", "text"), f("baEmail", "Email", "text")]),
        ppl("Buyer's lender", [f("blName", "Name", "text"), f("blEmail", "Email", "text"), f("blCo", "Company", "text")]),
        ppl("Buyer's title", [f("btCo", "Title company", "text"), f("btContact", "Contact, email / phone", "text")]),
        ppl("Seller's title", [f("stCo", "Title company", "text"), f("stContact", "Contact, email / phone", "text")])],
    };
  })(),
  // Under Contract/Pending columns: a contract sits in the first column whose date is still open.
  ucPhases: [["Inspection", "insp"], ["HOA review", "hoa"], ["Financing", "ws"], ["Closing", "close"]],
  statuses: {
    Buyer: ["Consult scheduled", "Consult complete", "Rep signed", "Showing homes", "Submitting offers"],
    Listing: ["Consult scheduled", "Consult complete", "Listing signed / Prep", "Coming soon", "Active"],
  },
  team: [["LP", "Luke Pettersen"], ["AS", "Alyssa Chakiton"]],
};
window.HQ.contacts = window.HQ.contacts || {};
window.HQ.files = window.HQ.files || [];
window.HQ.nextCid = window.HQ.nextCid || 1;
window.HQ.newContact = (name, extra) => {
  const cid = "p" + (window.HQ.nextCid++);
  window.HQ.contacts[cid] = Object.assign({ name, stage: "Lead", follow: null, source: "", referred: "", mailing: name, tags: [], phones: [], emails: [], address: "", birthdays: [], homeiversary: "", tasks: [], history: [], assigned: "Luke Pettersen", created: new Date(2026, 9, 12) }, extra || {});
  return cid;
};
window.HQ.deleteContact = cid => {
  delete window.HQ.contacts[cid];
  for (let i = window.HQ.files.length - 1; i >= 0; i--) if (window.HQ.files[i].cid === cid) window.HQ.files.splice(i, 1);
};

// Turn a template into dated tasks, counting from `start` (a Date). Steps timed off
// contract dates use the deal's dates when there is one; here they fall back to start.
window.HQ.expand = (tpl, start, dates = {}) => tpl.phases.flatMap(ph => ph.steps.map(st => {
  const base = { t: st.name, who: st.who, type: st.type, phase: ph.name };
  if (st.dir === "none") return Object.assign(base, { due: null });
  if (st.anchor !== "Start date" && !dates[st.anchor]) return Object.assign(base, { due: null, waiting: st.anchor });
  const due = new Date(st.anchor === "Start date" ? start : dates[st.anchor]);
  due.setDate(due.getDate() + (st.dir === "before" ? -st.days : st.dir === "after" ? st.days : 0));
  return Object.assign(base, { due });
}));
