import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve("user-guide");
const screensDir = path.join(root, "screens");
const renderDir = path.join(root, "rendered");
const pdfPath = path.join(root, "StockFix_User_Guide.pdf");
fs.mkdirSync(renderDir, { recursive: true });

const pages = [
  ["01-choose-access.jpg", "Choose access", "Start here", "Choose the StockFix access path for your role."],
  ["02-select-client-store.jpg", "Select client and store", "Rep workflow", "Select the client and store you are visiting."],
  ["03-select-rep.jpg", "Select representative", "Rep workflow", "Choose the representative account to continue."],
  ["04-home.jpg", "Rep home", "Current Nexus workflow", "Use Home as the starting point for stores, progress, and tools."],
  ["05-stores.jpg", "Stores", "Current Nexus workflow", "Open a store visit and return to an unfinished visit when needed."],
  ["06-insights.jpg", "Store insights", "Current Nexus workflow", "Review store health and select an issue category to investigate."],
  ["07-issue-list-overstock.jpg", "Issue list", "Current Nexus workflow", "Browse affected SKUs and open a product detail page."],
  ["08-sku-detail.jpg", "SKU detail", "Current Nexus workflow", "Review stock signals and choose Supply, Analysis, or Fix."],
  ["09-action-capture.jpg", "Action capture", "Current Nexus workflow", "Record what was found on shelf, add feedback, and attach photos."],
  ["10-supply.jpg", "Supply analysis", "Current Nexus workflow", "Review store and DC stock before deciding on a supply action."],
  ["11-analysis.jpg", "Analysis", "Current Nexus workflow", "Use the analysis view to understand the issue and recommended action."],
  ["12-fix.jpg", "Fix", "Current Nexus workflow", "Complete the recommended fix and capture supporting evidence."],
  ["13-exit-visit.jpg", "End Visit & Send Summary", "Current Nexus workflow", "Send one consolidated visit email with completed tasks, feedback, and image links."],
  ["14-instock.jpg", "In-stock analysis", "Current Nexus workflow", "Review in-stock performance for the selected store."],
  ["15-dc-availability.jpg", "DC availability", "Current Nexus workflow", "Check distribution-centre availability and supported items."],
  ["16-cover-analysis.jpg", "Cover analysis", "Current Nexus workflow", "Review weeks of cover bands and lowest-cover SKUs."],
  ["17-sales-at-risk.jpg", "Sales at risk", "Current Nexus workflow", "See estimated missed units and the SKUs contributing to the risk."],
  ["18-all-issues.jpg", "All stock issues", "Current Nexus workflow", "Filter the complete issue list by stock condition."],
  ["19-replenishment.jpg", "Replenishment opportunity", "Current Nexus workflow", "Review recommended orders and DC-supported replenishment."],
  ["20-cover-distribution.jpg", "Cover distribution", "Current Nexus workflow", "Compare the distribution of SKUs across cover bands."],
  ["21-select-manager.jpg", "Select manager", "Manager workflow", "Choose a manager account for management reporting."],
  ["22-import-data.jpg", "Import data", "Admin workflow", "Upload the daily spreadsheet and review the expected headers before importing."],
  ["23-rep-progress.jpg", "Rep task progress", "Reporting", "Review open tasks, completed tasks, completion, and top stores."],
  ["24-manager-progress.jpg", "Team task progress", "Reporting", "Filter team progress by client and store."],
  ["25-admin-leaderboard.jpg", "Admin leaderboard", "Admin workflow", "Leaderboard route captured in its initial loading state; data appears when the endpoint responds."],
  ["26-qr.jpg", "QR access", "Utility", "Use the QR route to open the configured StockFix access link."],
  ["27-merchandiser-pilot.jpg", "Merchandiser Pilot", "Pilot workflow", "Pilot dashboard route; this capture shows its data-loading state."],
  ["28-inventory-dashboard.jpg", "Inventory Hub", "Admin workflow", "Use the inventory dashboard to review stock-health measures and problem areas."],
  ["29-legacy-insights.jpg", "Legacy insights", "Older retained route", "Older store-overview route retained for compatibility. The current Nexus Insights flow is documented earlier."],
  ["30-legacy-availability.jpg", "Legacy availability", "Older retained route", "Older availability breakdown route retained for compatibility."],
  ["31-legacy-line-list.jpg", "Legacy line list", "Older retained route", "Older filtered line-list route retained for compatibility."],
  ["32-legacy-sku.jpg", "Legacy SKU detail", "Older retained route", "Older SKU record route retained for compatibility."],
  ["33-not-found.jpg", "Not found", "System route", "Fallback screen for an unrecognised route."],
];

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const text = (value, x, y, size, fill = "#d8e5f3", weight = 400, anchor = "start") =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}px" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;

const baseSvg = (content) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="1000" viewBox="0 0 1600 1000">
  <rect width="1600" height="1000" fill="#06152a"/>
  ${content}
</svg>`;

const cover = baseSvg(`
  <circle cx="1360" cy="170" r="220" fill="#0b2742" opacity=".75"/>
  <circle cx="1360" cy="170" r="150" fill="none" stroke="#1c79c2" stroke-width="2" opacity=".5"/>
  <circle cx="1360" cy="170" r="90" fill="none" stroke="#ff8a00" stroke-width="2" opacity=".55"/>
  ${text("Stock", 110, 230, 92, "#f3f7fb", 700)}
  ${text("Fix", 405, 230, 92, "#ff8a00", 700)}
  ${text("User Guide", 116, 320, 44, "#9db5ce", 400)}
  ${text("Store visit, action capture, reporting, and admin workflows", 118, 400, 26, "#d8e5f3", 400)}
  <rect x="118" y="490" width="560" height="5" rx="2" fill="#ff8a00"/>
  ${text("Screens captured from the running application", 118, 555, 22, "#8fa7c0", 400)}
  ${text("August 2026", 118, 600, 22, "#8fa7c0", 400)}
  ${text("33 routed screens documented", 1480, 910, 22, "#8fa7c0", 400, "end")}
  ${text("Meridian Group", 1480, 950, 20, "#ff8a00", 700, "end")}
`);

const quickStart = baseSvg(`
  ${text("How to use StockFix", 80, 100, 46, "#f3f7fb", 700)}
  ${text("Current workflow at a glance", 80, 145, 23, "#ff8a00", 700)}
  <rect x="80" y="200" width="1440" height="630" rx="18" fill="#0a2139" stroke="#1d4568" stroke-width="2"/>
  ${text("1", 140, 300, 52, "#ff8a00", 700)}
  ${text("Choose access, client, store, and representative", 220, 292, 28, "#f3f7fb", 700)}
  ${text("Start a visit from Stores, then open Insights for the selected store.", 220, 335, 21, "#9db5ce", 400)}
  ${text("2", 140, 455, 52, "#3fa7ff", 700)}
  ${text("Investigate an issue and capture the fix", 220, 447, 28, "#f3f7fb", 700)}
  ${text("Follow an issue list to SKU detail, choose a path, and save captures immediately.", 220, 490, 21, "#9db5ce", 400)}
  ${text("3", 140, 610, 52, "#35d39a", 700)}
  ${text("End the visit and send the summary", 220, 602, 28, "#f3f7fb", 700)}
  ${text("The summary email includes completed tasks, feedback, and links to uploaded photos.", 220, 645, 21, "#9db5ce", 400)}
  ${text("Important: captures are saved as you work, but the email is sent only from End Visit & Send Summary.", 220, 735, 21, "#ffb15b", 700)}
  ${text("If you try to leave after capturing work, choose End Visit & Send Summary or Keep Working in This Store.", 220, 775, 21, "#ffb15b", 400)}
`);

const emailPage = baseSvg(`
  ${text("End Visit and visit-summary email", 80, 100, 46, "#f3f7fb", 700)}
  ${text("The required close-out step", 80, 145, 23, "#ff8a00", 700)}
  <rect x="80" y="200" width="690" height="650" rx="18" fill="#0a2139" stroke="#1d4568" stroke-width="2"/>
  ${text("Before ending a visit", 125, 265, 27, "#f3f7fb", 700)}
  ${text("• Finish or review captured tasks", 125, 325, 22, "#d8e5f3", 400)}
  ${text("• Confirm feedback and photos are present", 125, 375, 22, "#d8e5f3", 400)}
  ${text("• Open End Visit & Send Summary", 125, 425, 22, "#d8e5f3", 400)}
  ${text("• Wait for the send request to finish", 125, 475, 22, "#d8e5f3", 400)}
  ${text("• Retry from the summary page if delivery fails", 125, 525, 22, "#d8e5f3", 400)}
  <rect x="850" y="200" width="670" height="650" rx="18" fill="#0a2139" stroke="#1d4568" stroke-width="2"/>
  ${text("What the email contains", 895, 265, 27, "#f3f7fb", 700)}
  ${text("Store, client, and representative", 895, 335, 22, "#35d39a", 700)}
  ${text("All completed tasks for the store and rep", 895, 395, 22, "#d8e5f3", 400)}
  ${text("Feedback captured during the visit", 895, 455, 22, "#d8e5f3", 400)}
  ${text("Uploaded image links (image1 through image4)", 895, 515, 22, "#d8e5f3", 400)}
  ${text("Recipients resolved for the rep, manager, client, and region", 895, 575, 22, "#d8e5f3", 400)}
  ${text("Duplicate clicks are blocked while sending.", 895, 690, 22, "#ffb15b", 700)}
  ${text("The visit is cleared only after a successful send.", 895, 735, 22, "#ffb15b", 700)}
`);

const routeIndex = baseSvg(`
  ${text("Route index", 80, 90, 46, "#f3f7fb", 700)}
  ${text("Every captured screen in this guide", 80, 135, 23, "#ff8a00", 700)}
  ${text("Current Nexus workflow", 80, 185, 25, "#35d39a", 700)}
  ${text("01–20  Access, store visit, issue investigation, and analysis", 100, 230, 21, "#d8e5f3", 400)}
  ${text("Reporting and administration", 80, 310, 25, "#3fa7ff", 700)}
  ${text("21–28  Manager access, import, progress, QR, pilot, and Inventory Hub", 100, 355, 21, "#d8e5f3", 400)}
  ${text("Older retained routes", 80, 435, 25, "#ffb15b", 700)}
  ${text("29–32  Legacy insights, availability, line list, and SKU detail", 100, 480, 21, "#d8e5f3", 400)}
  ${text("System route", 80, 560, 25, "#aebfd1", 700)}
  ${text("33  Not found fallback", 100, 605, 21, "#d8e5f3", 400)}
  <rect x="80" y="700" width="1440" height="100" rx="14" fill="#0a2139" stroke="#1d4568" stroke-width="2"/>
  ${text("Legacy = older screens still available in the application, not removed.", 120, 760, 23, "#ffb15b", 700)}
`);

const screenshotPage = (entry, index, total) => {
  const [filename, title, category, note] = entry;
  const imagePath = path.join(screensDir, filename);
  const data = fs.readFileSync(imagePath).toString("base64");
  const imageHref = `data:image/jpeg;base64,${data}`;
  return baseSvg(`
    ${text(title, 70, 62, 34, "#f3f7fb", 700)}
    ${text(category, 70, 104, 19, category.includes("Legacy") || category.includes("Older") ? "#ffb15b" : "#35d39a", 700)}
    ${text(note, 70, 140, 19, "#9db5ce", 400)}
    <rect x="70" y="175" width="1460" height="820" rx="16" fill="#031022" stroke="#1d4568" stroke-width="2"/>
    <image x="85" y="190" width="1430" height="806" preserveAspectRatio="none" href="${imageHref}" />
    ${text(`${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, 1530, 45, 17, "#8fa7c0", 400, "end")}
  `);
};

const svgPages = [cover, quickStart, emailPage, routeIndex];
for (let i = 0; i < pages.length; i++) svgPages.push(screenshotPage(pages[i], i + 1, pages.length));

const rendered = [];
for (let i = 0; i < svgPages.length; i++) {
  const svgPath = path.join(renderDir, `page-${String(i + 1).padStart(2, "0")}.svg`);
  const pngPath = path.join(renderDir, `page-${String(i + 1).padStart(2, "0")}.png`);
  fs.writeFileSync(svgPath, svgPages[i]);
  execFileSync("magick", [svgPath, "-background", "#06152a", "-quality", "96", pngPath], { stdio: "ignore" });
  rendered.push(pngPath);
}

execFileSync("magick", [...rendered, "-quality", "92", pdfPath], { stdio: "inherit" });
console.log(`Created ${pdfPath} with ${rendered.length} pages.`);