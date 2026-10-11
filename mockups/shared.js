// Shared between mockup pages: task templates (edited in Admin, applied from
// contact pages) and a hand-off queue of new tasks for the Tasks page.
window.HQ = window.HQ || (() => {
  const s = (name, anchor, days, dir, who, type, extra = {}) => Object.assign({ name, anchor, days, dir, who, type, tpl: "", cond: "Always", advance: "" }, extra);
  let n = 0; const T = (name, trigger, phases) => ({ id: "t" + (++n), name, trigger, phases });
  return {
    newTasks: [],
    templates: [
      T("Buyer · New lead", "Buyer · Lead", [{ name: "First contact", steps: [s("Call new lead", "Start date", 0, "on", "Luke", "Call"), s("Intro email", "Start date", 0, "on", "Alyssa", "Email", { tpl: "Website sign-up welcome" }), s("Schedule consult", "Start date", 2, "after", "Luke", "Task", { advance: "Consult" })] }]),
      T("Buyer · Consult", "Buyer · Consult", [{ name: "Before the consult", steps: [s("Agency disclosure + more info email", "Start date", 0, "on", "Alyssa", "Email"), s("Consult confirmation text", "Consult date", 1, "before", "Luke", "Text")] }, { name: "After the consult", steps: [s("Intro + Homespotter + legal name text", "Consult date", 0, "on", "Alyssa", "Text", { tpl: "Intro + Homespotter + legal name" }), s("Connect with lender?", "Consult date", 1, "after", "Luke", "Task")] }]),
      T("Buyer · Rep signed & searching", "Buyer · Rep Signed / Searching", [{ name: "Buyer rep", steps: [s("Send buyer rep to sign", "Start date", 0, "on", "Alyssa", "Task"), s("Buyer rep breakdown email", "Start date", 0, "on", "Alyssa", "Email", { tpl: "Buyer rep breakdown" }), s("Buyer rep signed + saved", "Start date", 1, "after", "Alyssa", "Task")] }, { name: "Searching", steps: [s("Set up home search", "Buyer rep signed", 1, "after", "Luke", "Task"), s("Check in on showings", "Buyer rep signed", 14, "after", "Luke", "Call"), s("Buyer rep expiring soon", "Buyer rep expiration", 14, "before", "Luke", "Task")] }]),
      T("Buyer · Under contract", "Buyer · Under Contract", [
        { name: "Under Contract", steps: [s("Purchase agreement accepted email", "Final Acceptance", 0, "on", "Alyssa", "Email", { tpl: "Purchase agreement accepted" }), s("Lender intro email", "Final Acceptance", 0, "on", "Luke", "Email"), s("Request earnest money", "Final Acceptance", 1, "after", "Alyssa", "Text", { tpl: "Earnest money" }), s("Lead-paint pamphlet email", "Final Acceptance", 1, "after", "Alyssa", "Email", { cond: "Built before 1978" })] },
        { name: "Inspection", steps: [s("Schedule inspection", "Final Acceptance", 1, "after", "Luke", "Task"), s("Day-of-inspection text", "Inspection", 3, "before", "Alyssa", "Text", { tpl: "Day-of-inspection" }), s("Review inspection report with clients", "Inspection", 2, "before", "Luke", "Task"), s("Signed amendment to lender + title", "Inspection", 0, "on", "Alyssa", "Email")] },
        { name: "Financing", steps: [s("Remind lender about written statement", "Written Statement", 2, "before", "Alyssa", "Email")] },
        { name: "HOA", steps: [s("Send HOA docs to clients", "Final Acceptance", 4, "after", "Alyssa", "Email", { cond: "HOA property" }), s("Confirm rescission period ended", "HOA Rescission", 0, "on", "Alyssa", "Task", { cond: "HOA property" })] },
        { name: "Closing", steps: [s("Order closing gift", "Closing", 14, "before", "Luke", "Task"), s("Final walkthrough", "Closing", 1, "before", "Luke", "Task"), s("Closing day", "Closing", 0, "on", "Luke", "Task", { advance: "Closed" })] },
      ]),
      T("Buyer · Post-close", "Buyer · Closed", [{ name: "Post-close", steps: [s("\"How was the move?\" text", "Start date", 1, "after", "Luke", "Text"), s("Thank-you card", "Start date", 3, "after", "Luke", "Task"), s("Zillow review request", "Start date", 5, "after", "Alyssa", "Text"), s("Google review request", "Start date", 21, "after", "Alyssa", "Email")] }]),
      T("Seller · Listing prep", "Seller · Listing Signed / Prep", [{ name: "Prep", steps: [s("Withhold listing in MLS", "Start date", 0, "on", "Alyssa", "Task"), s("Schedule photos", "Start date", 1, "after", "Alyssa", "Task"), s("Drop off lockbox", "Start date", 2, "after", "Luke", "Task"), s("Disclosures + lead paint", "Start date", 3, "after", "Alyssa", "Task", { cond: "Built before 1978" })] }, { name: "Media", steps: [s("Photos to clients", "Photos taken", 1, "after", "Alyssa", "Email"), s("Upload to MLS", "Photos taken", 2, "after", "Alyssa", "Task", { advance: "Coming Soon" })] }]),
      T("Seller · Coming soon launch", "Seller · Coming Soon", [{ name: "Launch", steps: [s("Showing instructions", "Start date", 0, "on", "Alyssa", "Task"), s("Coming-soon email", "Start date", 0, "on", "Alyssa", "Email"), s("Sign install", "Active date", 3, "before", "Luke", "Task"), s("Go active in MLS", "Active date", 0, "on", "Alyssa", "Task", { advance: "Active" })] }]),
      T("Seller · Under contract", "Seller · Under Contract", [{ name: "Under Contract", steps: [s("Mark contingent in MLS", "Final Acceptance", 0, "on", "Alyssa", "Task"), s("Purchase agreement accepted email", "Final Acceptance", 0, "on", "Alyssa", "Email", { tpl: "Purchase agreement accepted" })] }, { name: "Closing", steps: [s("Closing reminder email", "Closing", 14, "before", "Alyssa", "Email"), s("Closing day", "Closing", 0, "on", "Luke", "Task", { advance: "Closed" })] }]),
      T("Open house follow-up", "", [{ name: "Follow-up", steps: [s("Thanks for coming text", "Start date", 0, "on", "Alyssa", "Text"), s("Send similar listings", "Start date", 1, "after", "Alyssa", "Email"), s("Follow-up call", "Start date", 3, "after", "Luke", "Call")] }]),
      T("Past client yearly check-in", "", [{ name: "Check-in", steps: [s("Real estate health check call", "Start date", 0, "on", "Luke", "Call"), s("Send home value update", "Start date", 2, "after", "Alyssa", "Email"), s("Add to holiday card list", "Start date", 2, "after", "Alyssa", "Task")] }]),
    ],
  };
})();
// Turn a template into dated tasks, counting from `start` (a Date). Steps timed off
// contract dates use the deal's dates when there is one; here they fall back to start.
window.HQ.expand = (tpl, start, dates = {}) => tpl.phases.flatMap(ph => ph.steps.map(st => {
  if (st.dir === "none") return { t: st.name, due: null, who: st.who, type: st.type, phase: ph.name };
  const base = new Date(dates[st.anchor] || start);
  base.setDate(base.getDate() + (st.dir === "before" ? -st.days : st.dir === "after" ? st.days : 0));
  return { t: st.name, due: base, who: st.who, type: st.type, phase: ph.name };
}));
