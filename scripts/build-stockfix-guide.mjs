import pptxgen from "pptxgenjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imgDir = path.join(__dirname, "..", "screenshots", "stockfix_guide");
const outPath = path.join(__dirname, "..", "screenshots", "StockFix_Navigation_Guide.pptx");

const NAVY = "003B71";
const ORANGE = "F97316";
const DARK = "1E293B";
const GREY = "64748B";

const pptx = new pptxgen();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Meridian Group";
pptx.title = "StockFix App Navigation Guide";

function addTitleSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: NAVY };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.15, w: 13.333, h: 0.04, fill: { color: ORANGE } });
  slide.addText("StockFix", {
    x: 0, y: 2.2, w: 13.333, h: 1, align: "center",
    fontSize: 54, bold: true, color: "FFFFFF", fontFace: "Arial",
  });
  slide.addText("App Navigation Guide", {
    x: 0, y: 3.35, w: 13.333, h: 0.7, align: "center",
    fontSize: 24, color: "93C5FD", fontFace: "Arial",
  });
  slide.addText("A screen-by-screen walkthrough — including exactly where to click and every dropdown available", {
    x: 0, y: 4.1, w: 13.333, h: 0.5, align: "center",
    fontSize: 14, color: "CBD5E1", fontFace: "Arial",
  });
  slide.addText("Powered by Meridian Group", {
    x: 0, y: 6.9, w: 13.333, h: 0.4, align: "center",
    fontSize: 11, color: "64748B", fontFace: "Arial",
  });
}

function addScreenSlide({ file, kicker, title, description, steps, dropdowns }) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };

  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: NAVY } });
  slide.addText(kicker.toUpperCase(), {
    x: 0.5, y: 0.15, w: 8, h: 0.3, fontSize: 12, bold: true, color: ORANGE, fontFace: "Arial", charSpacing: 1,
  });
  slide.addText(title, {
    x: 0.5, y: 0.42, w: 8, h: 0.6, fontSize: 26, bold: true, color: "FFFFFF", fontFace: "Arial",
  });

  const imgPath = path.join(imgDir, file);
  slide.addImage({
    path: imgPath,
    x: 0.5, y: 1.4, w: 7.2, h: 5.6,
    sizing: { type: "contain", w: 7.2, h: 5.6 },
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.4, w: 7.2, h: 5.6, line: { color: "CBD5E1", width: 1 }, fill: { type: "none" } });

  slide.addText(description, {
    x: 8.0, y: 1.5, w: 4.9, h: 0.9, fontSize: 13.5, color: DARK, fontFace: "Arial", valign: "top",
  });

  let y = 2.55;

  if (steps && steps.length) {
    slide.addText("HOW TO GET HERE", {
      x: 8.0, y, w: 4.9, h: 0.28, fontSize: 11, bold: true, color: GREY, fontFace: "Arial", charSpacing: 1,
    });
    y += 0.36;
    steps.forEach((step, i) => {
      slide.addShape(pptx.ShapeType.ellipse, { x: 8.0, y: y + 0.01, w: 0.26, h: 0.26, fill: { color: ORANGE }, line: { type: "none" } });
      slide.addText(String(i + 1), {
        x: 8.0, y: y + 0.01, w: 0.26, h: 0.26, align: "center", valign: "middle",
        fontSize: 10.5, bold: true, color: "FFFFFF", fontFace: "Arial",
      });
      slide.addText(step, {
        x: 8.4, y: y - 0.03, w: 4.5, h: 0.42, fontSize: 12, color: DARK, fontFace: "Arial", valign: "top",
      });
      y += 0.5;
    });
    y += 0.12;
  }

  if (dropdowns && dropdowns.length) {
    slide.addText("DROPDOWNS / FILTERS ON THIS SCREEN", {
      x: 8.0, y, w: 4.9, h: 0.28, fontSize: 11, bold: true, color: GREY, fontFace: "Arial", charSpacing: 1,
    });
    y += 0.34;
    dropdowns.forEach((d) => {
      slide.addShape(pptx.ShapeType.rect, { x: 8.0, y: y + 0.03, w: 0.09, h: 0.09, fill: { color: NAVY }, line: { type: "none" } });
      slide.addText([
        { text: d.name + ": ", options: { bold: true, color: NAVY } },
        { text: d.detail, options: { color: DARK } },
      ], {
        x: 8.22, y: y - 0.06, w: 4.7, h: 0.4, fontSize: 11.5, fontFace: "Arial", valign: "top",
      });
      y += 0.42;
    });
  }
}

addTitleSlide();

addScreenSlide({
  file: "01_choose_access.jpg",
  kicker: "Step 1 · Entry Point",
  title: "Choose Access",
  description: "The landing screen for StockFix. Every user starts here and picks the role that matches how they'll use the app.",
  steps: [
    "Open the StockFix app URL",
    "Choose \"I'm a Rep / Merchandiser\" for field task capture",
    "Choose \"I'm a Manager\" for oversight & reporting",
    "Choose \"I'm a Client\" for the external client view",
  ],
});

addScreenSlide({
  file: "12_select_rep_dropdown_open.jpg",
  kicker: "Step 2 · Rep Login",
  title: "Select Your Name (dropdown open)",
  description: "Tapping the \"Select Rep\" field opens a searchable dropdown of every rep name. This is the first dropdown a rep will use.",
  steps: [
    "From Choose Access, tap \"I'm a Rep / Merchandiser\"",
    "Tap the \"Select Rep\" field to open this dropdown",
    "Type to search, or scroll and tap your name",
    "The dropdown closes and your name is filled in",
  ],
  dropdowns: [
    { name: "Select Rep", detail: "Searchable list of every rep name in the system" },
  ],
});

addScreenSlide({
  file: "02_select_rep_store.jpg",
  kicker: "Step 3 · Rep Login",
  title: "Select Your Store",
  description: "After picking a name, a second dropdown appears for choosing the store to visit — plus two buttons for what to do next.",
  steps: [
    "With your name selected, the \"Select Store\" dropdown appears",
    "Tap it and choose the store you're visiting today",
    "Tap \"START VISIT\" to begin capturing tasks at that store",
    "Or tap \"My Dashboard\" to see your own task progress instead",
  ],
  dropdowns: [
    { name: "Select Store", detail: "Searchable list of stores assigned to the selected rep" },
  ],
});

addScreenSlide({
  file: "03_dashboard.jpg",
  kicker: "Step 4 · Main Hub · WHERE TO SEE TASKS",
  title: "StockFix Dashboard",
  description: "This is the main hub. To see the full task list, tap the \"Total Tasks\", \"Pending\", or \"Completed\" card — each one opens the Tasks screen, optionally pre-filtered.",
  steps: [
    "Tap the \"Total Tasks\" card to see ALL tasks",
    "Tap \"Pending\" to jump straight to open tasks only",
    "Tap \"Completed\" to see tasks already actioned",
    "Or tap \"Tasks\" in the bottom nav bar at any time",
  ],
  dropdowns: [
    { name: "Region", detail: "Filter dashboard totals by region" },
    { name: "Client", detail: "Filter dashboard totals by client" },
    { name: "Store", detail: "Jump straight into a specific store's summary" },
  ],
});

addScreenSlide({
  file: "13_dashboard_region_dropdown.jpg",
  kicker: "Step 4b · Quick Filters",
  title: "Dashboard — Region Dropdown Open",
  description: "The Quick Filters section has three dropdowns side by side. Here the Region dropdown is open, showing the list of available regions plus \"All Regions\".",
  steps: [
    "On the Dashboard, find the \"Quick Filters\" card",
    "Tap the \"Region\" dropdown to filter by area",
    "Tap \"Client\" to filter by client instead",
    "Tap \"Select Store\" to jump directly into one store",
  ],
  dropdowns: [
    { name: "Region", detail: "Currently open — shows \"All Regions\" plus each region" },
    { name: "Client", detail: "Filters KPIs and charts to one client" },
    { name: "Store", detail: "Navigates straight to that store's summary page" },
  ],
});

addScreenSlide({
  file: "11_tasks_list.jpg",
  kicker: "Step 5 · TASK LIST — Where Reps Work",
  title: "Tasks Screen",
  description: "This is where a rep actually sees and works their tasks — grouped by action type (e.g. \"Urgent: Place Order\"), with search and Pending/Completed tabs.",
  steps: [
    "Reached by tapping any KPI card, or the \"Tasks\" icon in the bottom nav",
    "Use the search bar to find a task by article, barcode, or client",
    "Switch between \"Pending\" and \"Completed\" tabs",
    "Tap any task card to open it and capture feedback",
  ],
  dropdowns: [
    { name: "Pending / Completed", detail: "Tab toggle, not a dropdown — switches which tasks are listed" },
    { name: "Search", detail: "Free-text search across article, barcode and client" },
  ],
});

addScreenSlide({
  file: "04_task_detail.jpg",
  kicker: "Step 6 · Task Detail",
  title: "Task Feedback",
  description: "Opening a task shows stock metrics (SOH, DC stock, sell-out, WFC) with trend charts, plus the action capture form the rep fills in.",
  steps: [
    "From the Tasks screen, tap any task card",
    "Review SOH, DC SOH, Sell Out and WFC figures and trends",
    "Enter the Physical Count and confirm if stock was adjusted",
    "Open the Reason Code and Action Taken dropdowns (next slides)",
  ],
});

addScreenSlide({
  file: "14_task_reason_code_dropdown.jpg",
  kicker: "Step 6b · Task Feedback",
  title: "Reason Code Dropdown Open",
  description: "Every task requires a Reason Code before it can be submitted. This dropdown lists the standard reasons for the stock issue.",
  steps: [
    "On the Task Feedback screen, tap \"Reason Code\"",
    "Scroll or tap to pick the reason that matches the issue",
  ],
  dropdowns: [
    { name: "Reason Code", detail: "Awaiting delivery, No stock available, Store out of stock, Stock in backroom, Shelf space issue, Slow-moving, Damaged/expired, Not ranged, Store operational issue, System/data issue, Promo not set up, Other" },
  ],
});

addScreenSlide({
  file: "15_task_action_taken_dropdown.jpg",
  kicker: "Step 6c · Task Feedback",
  title: "Action Taken Dropdown Open",
  description: "After the Reason Code, the rep must also select the Action Taken — what they actually did to resolve or escalate the issue.",
  steps: [
    "On the Task Feedback screen, tap \"Action Taken\"",
    "Pick the action that matches what was done in-store",
    "Add any free-text Feedback notes below",
    "Scroll down and tap Submit to save the task",
  ],
  dropdowns: [
    { name: "Action Taken", detail: "Order placed, Escalated to supervisor, Logged query with DC, Stock moved to shelf, Shelf/planogram discussed, System stock corrected, Promo/display completed, Follow-up required, Unable to action, No action required, Other" },
  ],
});

addScreenSlide({
  file: "05_store_summary.jpg",
  kicker: "Step 7 · Store View",
  title: "Store Summary",
  description: "A store-level rollup showing total/pending/done task counts, SOH and sales stats, SKUs out of stock, and quick filter chips for urgent/OOS tasks.",
  steps: [
    "Tap a store name/tile from the Dashboard, or the Store dropdown",
    "Review store-level totals and stock health",
    "Tap \"Urgent Only\" or \"OOS Only\" to filter that store's tasks",
    "Scroll down and tap any task to open it",
  ],
  dropdowns: [
    { name: "Urgent Only / OOS Only", detail: "Quick filter chips — narrow the store's task list by severity" },
  ],
});

addScreenSlide({
  file: "06_import_data.jpg",
  kicker: "Step 8 · Manager Tools",
  title: "Import Data",
  description: "Managers bulk-load the day's or week's task list by uploading an Excel or CSV file with the expected column headers.",
  steps: [
    "From the Dashboard, tap \"Import\" (managers only)",
    "Choose your spreadsheet file (.xlsx or .csv)",
    "Optionally tick \"Full Refresh\" to clear old tasks first",
    "Confirm the column headers match, then upload",
  ],
});

addScreenSlide({
  file: "07_select_client.jpg",
  kicker: "Step 9 · Client Access",
  title: "Client Visit Setup",
  description: "External clients select their company and store to start a locked-down visit view scoped to just their own data.",
  steps: [
    "From Choose Access, tap \"I'm a Client\"",
    "Select your company from the Client dropdown",
    "Select your store from the Store dropdown",
    "Tap \"Start Visit\" to view your store's task data",
  ],
  dropdowns: [
    { name: "Select Client", detail: "List of client companies" },
    { name: "Select Store", detail: "Enabled only after a client is chosen" },
  ],
});

addScreenSlide({
  file: "08_rep_progress.jpg",
  kicker: "Step 10 · Rep Self-Tracking",
  title: "My Task Progress",
  description: "Reps can check their own completion stats — priority tasks open vs done, and a searchable list of open/completed tasks.",
  steps: [
    "From Select Rep/Store, tap \"My Dashboard\"",
    "Review Priority Open / Done / Rate cards",
    "Switch between \"Open\" and \"Completed\" tabs",
    "Search tasks by name to find a specific one quickly",
  ],
});

addScreenSlide({
  file: "09_admin_leaderboard.jpg",
  kicker: "Step 11 · Manager Reporting",
  title: "Admin Leaderboard",
  description: "A live performance leaderboard for managers: top regions, top managers, top reps, completion by action type, badges, and streaks — filterable by client and time period.",
  steps: [
    "Log in as a Manager, then open \"Leaderboard\"",
    "Filter by Client and time period",
    "Review Top Reps, Top Managers, and Top Regions",
    "Check Rep Badges and Top Streaks for recognition",
  ],
  dropdowns: [
    { name: "All Clients", detail: "Filter the whole leaderboard by client" },
    { name: "Past Week / etc.", detail: "Choose the reporting time window" },
  ],
});

addScreenSlide({
  file: "10_merchandiser_pilot.jpg",
  kicker: "Bonus · Executive View",
  title: "Merchandiser Pilot Dashboard",
  description: "A branded, dark-themed executive dashboard tracking the Shoprite & Checkers merchandiser pilot: capture rate, coverage, and store performance across 1,023 field reps.",
  steps: [
    "Navigate to the /merchandiser-pilot URL",
    "Use the filter bar to narrow by manager, region, store, banner, merchandiser or week",
    "Review KPI cards: Active Merchandisers, Tasks Logged, Capture Rate",
    "Scroll to Store Performance for detailed drill-down and CSV export",
  ],
  dropdowns: [
    { name: "Line Manager / Region / Store / Banner / Merchandiser / Week", detail: "Six independent filters across the top of the dashboard" },
  ],
});

await pptx.writeFile({ fileName: outPath });
console.log("Saved to", outPath);
