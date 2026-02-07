import pandas as pd
import numpy as np
import os
import requests
import json
import sys

# ==============================================================
# CONFIG
# ==============================================================
CLIENT_NAME = "ALPEN"  # must match parquet 'client' values

PARQUET_PATH = r"C:\Users\CarinPillay\OneDrive - Meridian Group\Client Service Team - SOH Weekly Updates\ALPEN\Inventory_Combined.parquet"

CALL_CYCLE_XLSX = r"C:\Users\CarinPillay\OneDrive - Meridian Group\Client Service Team - SOH Weekly Updates\Aspen\Rep Master\Meridian Master - Aspen.xlsx"
CALL_CYCLE_SHEET = "Sheet1"  # change if needed

OUTPUT_FOLDER = r"C:\Users\CarinPillay\OneDrive - Meridian Group\App Output Data\ALPEN"

# ── StockFix API Config ──────────────────────────────────────
STOCKFIX_URL = "https://202f0b6a-cb3d-4fc3-8b37-dc6f9df5de6c-00-1caag6lmp08eu.picard.replit.dev"
CLEAR_EXISTING = False   # Set True to wipe ALL tasks before import (full refresh)
DRY_RUN = True           # Set True to test without saving (shows summary only)
# ─────────────────────────────────────────────────────────────

CALLCYCLE_HEADERS = {
    "store_name": "STORE NAME",
    "region": "REGION",
    "banner": "BANNER",
    "rep_name": "REP NAME",
    "line_manager": "LINE MANAGER",
}

INCLUDE_ACTIONS = {
    "Fix Counts: Negative SOH",
    "Review: Risk of OOS",
    "Urgent: Place Order - DC has stock",
    "Check Count: No Sales in 30 Days",
    # "OOS – Stock on Order",
}

# ==============================================================
# HELPERS
# ==============================================================
def norm_text(s):
    return (
        str(s).lower().strip()
        .replace("\xa0", " ")
        .replace("'", "'")
        .replace("–", "-")
        .replace("&", "and")
        .replace("  ", " ")
    )

def ensure_col(df, col, default=0):
    if col not in df.columns:
        df[col] = default
    return df

def compute_wfc_and_action(df):
    df["store soh"] = pd.to_numeric(df["store soh"], errors="coerce")
    df["supplying dc soh"] = pd.to_numeric(df["supplying dc soh"], errors="coerce")
    df["sell out p4 weeks"] = pd.to_numeric(df["sell out p4 weeks"], errors="coerce").fillna(0)
    df["open po qty"] = pd.to_numeric(df["open po qty"], errors="coerce").fillna(0)

    soh = df["store soh"]
    dcsoh = df["supplying dc soh"]
    salesp4 = df["sell out p4 weeks"]
    po = df["open po qty"]

    avg_sales = salesp4 / 4.0
    df["WFC"] = np.where(avg_sales > 0, soh / avg_sales, 0)
    df["WFC"] = pd.to_numeric(df["WFC"], errors="coerce").fillna(0)

    wfc = df["WFC"]
    has_sales = salesp4 > 0

    conditions = [
        soh.isna(),
        soh < 0,
        (soh == 0) & (po > 0),
        (soh == 0) & (dcsoh == 0),
        (soh == 0) & (dcsoh > 0),
        (soh > 0) & (salesp4 == 0),
        has_sales & (wfc < 2),
        has_sales & (wfc >= 2) & (wfc <= 4),
        has_sales & (wfc > 4),
    ]

    choices = [
        "Unknown",
        "Fix Counts: Negative SOH",
        "OOS – Stock on Order",
        "Urgent: DC OOS",
        "Urgent: Place Order - DC has stock",
        "Check Count: No Sales in 30 Days",
        "Review: Risk of OOS",
        "Optimal",
        "Monitor: Possible Overstock",
    ]

    df["Action Column"] = np.select(conditions, choices, default="Unknown")
    return df

def add_stock_classification_this_week(export_df, this_week):
    export_df["Stock Classification (This Week)"] = ""

    is_tw = export_df["week ending"] == this_week

    soh = pd.to_numeric(export_df.loc[is_tw, "store soh"], errors="coerce")
    p4 = pd.to_numeric(export_df.loc[is_tw, "sell out p4 weeks"], errors="coerce").fillna(0)

    avg_sales = p4 / 4.0
    wfc_class = np.where(avg_sales > 0, soh / avg_sales, np.nan)

    cls = np.array(["Unknown"] * len(soh), dtype=object)

    cls = np.where(soh.isna(), "Unknown", cls)
    cls = np.where(soh < 0, "Negative SOH", cls)
    cls = np.where(soh == 0, "Out of Stock", cls)
    cls = np.where((avg_sales == 0) & (soh > 0), "No Sales (Idle Stock)", cls)
    cls = np.where((~np.isnan(wfc_class)) & (wfc_class < 2), "Understock", cls)
    cls = np.where((~np.isnan(wfc_class)) & (wfc_class >= 2) & (wfc_class <= 4), "Optimal", cls)
    cls = np.where((~np.isnan(wfc_class)) & (wfc_class > 4), "Overstock", cls)

    export_df.loc[is_tw, "Stock Classification (This Week)"] = cls
    return export_df

# ==============================================================
# 1) LOAD PARQUET
# ==============================================================
print("=" * 60)
print(f"  StockFix Import Script - {CLIENT_NAME}")
print("=" * 60)
print()

df = pd.read_parquet(PARQUET_PATH)
df.columns = df.columns.str.strip().str.lower()

ensure_col(df, "open po qty", 0)

if "week ending" not in df.columns:
    raise KeyError("Missing 'week ending' column in parquet.")
df["week ending"] = pd.to_datetime(df["week ending"], errors="coerce")

ensure_col(df, "client", CLIENT_NAME)
df["client"] = df["client"].astype(str).str.strip()
df = df[df["client"].str.upper() == CLIENT_NAME.upper()].copy()

# ==============================================================
# DROP ROWS WHERE CLEANED STORE NAME IS BLANK/NaN
# ==============================================================
if "cleaned store name" in df.columns:
    df = df[df["cleaned store name"].notna()].copy()
    df = df[df["cleaned store name"].astype(str).str.strip().str.lower() != "nan"].copy()
    df = df[df["cleaned store name"].astype(str).str.strip() != ""].copy()
else:
    raise KeyError("Missing 'cleaned store name' column — cannot exclude NaNs.")

df["cleaned store name"] = df["cleaned store name"].astype(str).str.strip().str.upper()
df["__store_join"] = df["cleaned store name"].astype(str).apply(norm_text)

# ==============================================================
# 2) LOAD CALL CYCLE + MERGE
# ==============================================================
cc_raw = pd.read_excel(CALL_CYCLE_XLSX, sheet_name=CALL_CYCLE_SHEET)
cc_raw.columns = cc_raw.columns.str.strip()
cc_lookup = {c.lower(): c for c in cc_raw.columns}

def col_ci_callcycle(name):
    key = name.strip().lower()
    if key not in cc_lookup:
        raise KeyError(f"Call cycle missing column: '{name}'")
    return cc_lookup[key]

cc = pd.DataFrame()
cc["__store_join"] = cc_raw[col_ci_callcycle(CALLCYCLE_HEADERS["store_name"])].astype(str).apply(norm_text)
cc["REGION.1"] = cc_raw[col_ci_callcycle(CALLCYCLE_HEADERS["region"])].astype(str)
cc["BANNER.1"] = cc_raw[col_ci_callcycle(CALLCYCLE_HEADERS["banner"])].astype(str)
cc["REP NAME"] = cc_raw[col_ci_callcycle(CALLCYCLE_HEADERS["rep_name"])].astype(str)
cc["LINE MANAGER"] = cc_raw[col_ci_callcycle(CALLCYCLE_HEADERS["line_manager"])].astype(str)
cc = cc.drop_duplicates(subset=["__store_join"])

df = df.merge(cc, on="__store_join", how="left")

df = df[df["REGION.1"].notna()].copy()
df = df[df["REGION.1"].astype(str).str.strip().str.lower() != "nan"].copy()
df = df[df["REGION.1"].astype(str).str.strip() != ""].copy()

# ==============================================================
# 3) CALCULATE WFC + ACTION COLUMN
# ==============================================================
for c in ["store soh", "supplying dc soh", "sell out p4 weeks", "open po qty"]:
    ensure_col(df, c, 0)

df = compute_wfc_and_action(df)

# ==============================================================
# 4) BUILD SEND EXPORT (4-WEEK HISTORY FOR KEYS THAT ARE TASKS THIS WEEK)
# ==============================================================
weeks = df["week ending"].dropna().drop_duplicates().sort_values(ascending=False).head(4).tolist()
if not weeks:
    raise ValueError("No valid week ending dates found.")

this_week = max(weeks)
hist = df[df["week ending"].isin(weeks)].copy()

bc_raw = hist.get("barcode", pd.Series([""] * len(hist))).astype(str).str.strip()
bc_raw = bc_raw.replace({"nan": "", "None": ""})
hist["barcode_str"] = np.where(bc_raw.eq(""), "0", bc_raw)

store_for_key = hist["cleaned store name"].astype(str).str.strip()
hist["__Key"] = store_for_key + "|" + hist["barcode_str"].astype(str).str.strip()

this_week_rows = hist[(hist["week ending"] == this_week) & (hist["barcode_str"].astype(str).str.strip().str.len() > 0)].copy()
this_week_rows["__ActionTrim"] = this_week_rows["Action Column"].astype(str).str.strip()

send_keys = set(
    this_week_rows.loc[this_week_rows["__ActionTrim"].isin(INCLUDE_ACTIONS), "__Key"]
    .dropna()
    .unique()
    .tolist()
)

export_df = hist[hist["__Key"].isin(send_keys)].copy()
export_df["SEND_THIS_WEEK"] = np.where(export_df["week ending"] == this_week, "SEND", "")

export_df = add_stock_classification_this_week(export_df, this_week)

# ==============================================================
# 5) FINAL EXPORT COLUMNS (EXACT app requirement)
# ==============================================================
FINAL_COLS = [
    "client",
    "REGION.1",
    "BANNER.1",
    "cleaned store name",
    "LINE MANAGER",
    "REP NAME",
    "barcode",
    "article description",
    "Stock Classification (This Week)",
    "Action Column",
    "week ending",
    "store soh",
    "WFC",
    "open po qty",
    "sell out p4 weeks",
    "supplying dc soh",
    "SEND_THIS_WEEK",
]

ensure_col(export_df, "client", CLIENT_NAME)
export_df["client"] = CLIENT_NAME

for c in FINAL_COLS:
    if c not in export_df.columns:
        export_df[c] = ""

final_export = export_df[FINAL_COLS].copy()

# ==============================================================
# 6) MAKE NUMERIC COLUMNS NUMERIC (comma decimals fix)
# ==============================================================
NUMERIC_COLS = ["store soh", "WFC", "open po qty", "sell out p4 weeks", "supplying dc soh", "barcode"]
for c in NUMERIC_COLS:
    if c in final_export.columns:
        s = final_export[c].astype(str).str.replace(" ", "", regex=False)
        s = s.str.replace("\u00a0", "", regex=False)
        s = s.str.replace(",", ".", regex=False)
        final_export[c] = pd.to_numeric(s, errors="coerce").fillna(0)

final_export["week ending"] = pd.to_datetime(final_export["week ending"], errors="coerce")

# ==============================================================
# 7) RENAME COLUMNS TO MATCH APP EXACTLY
# ==============================================================
final_export = final_export.rename(columns={
    "store soh": "Store SOH",
    "open po qty": "Open PO Qty",
    "sell out p4 weeks": "Sell out p4 weeks",
    "supplying dc soh": "Supplying dc soh",
})

# ==============================================================
# 8) SAVE EXCEL LOCALLY
# ==============================================================
week_str = pd.to_datetime(this_week).strftime("%Y-%m-%d")
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

out_xlsx = os.path.join(OUTPUT_FOLDER, f"{CLIENT_NAME}_SEND_EXPORT_{week_str}.xlsx")
final_export.to_excel(out_xlsx, index=False)

print(f"[LOCAL] Excel created: {out_xlsx}")
print(f"[LOCAL] Final rows exported: {len(final_export):,}")
print(f"[LOCAL] Send keys this week: {len(send_keys):,}")
print(f"[LOCAL] This week actions: {this_week_rows['Action Column'].value_counts().to_dict()}")
print(f"[LOCAL] This week classifications: {final_export.loc[final_export['week ending'] == this_week, 'Stock Classification (This Week)'].value_counts().to_dict()}")
print()

# ==============================================================
# 9) UPLOAD TO STOCKFIX APP
# ==============================================================
print("=" * 60)
print("  UPLOADING TO STOCKFIX APP")
print("=" * 60)

if DRY_RUN:
    print("[MODE] DRY RUN - file will be parsed and validated but NOT saved")
else:
    print("[MODE] LIVE - tasks WILL be saved to the app database")

if CLEAR_EXISTING and not DRY_RUN:
    print("[WARNING] CLEAR_EXISTING=True - all existing tasks will be deleted first!")

print(f"[URL] {STOCKFIX_URL}")
print(f"[FILE] {out_xlsx}")
print()

upload_url = f"{STOCKFIX_URL}/api/tasks/import"

params = {}
if CLEAR_EXISTING:
    params["clear"] = "true"
if DRY_RUN:
    params["dryRun"] = "true"

try:
    with open(out_xlsx, "rb") as f:
        files = {"file": (os.path.basename(out_xlsx), f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        print("[UPLOAD] Sending file to StockFix...")
        response = requests.post(upload_url, files=files, params=params, timeout=120)

    print(f"[RESPONSE] Status: {response.status_code}")
    print()

    if response.status_code == 200:
        result = response.json()
        
        if result.get("dryRun"):
            print("=" * 60)
            print("  DRY RUN RESULTS (nothing was saved)")
            print("=" * 60)
            summary = result.get("summary", {})
            print(f"  Total rows in file:     {summary.get('totalRowsInFile', '?'):>8,}")
            print(f"  Valid tasks (barcode):   {summary.get('validTasksWithBarcode', '?'):>8,}")
            print(f"  Skipped (no barcode):    {summary.get('skippedNoBarcode', '?'):>8,}")
            print(f"  Unique stores:           {summary.get('uniqueStores', '?'):>8,}")
            print(f"  Unique reps:             {summary.get('uniqueReps', '?'):>8,}")
            print(f"  Unique regions:          {summary.get('uniqueRegions', '?'):>8,}")
            print()
            
            print("  Action Breakdown:")
            for action, count in sorted(summary.get("actionBreakdown", {}).items(), key=lambda x: -x[1]):
                print(f"    {action:<45} {count:>6,}")
            print()
            
            print("  Region Breakdown:")
            for region, count in sorted(summary.get("regionBreakdown", {}).items(), key=lambda x: -x[1]):
                print(f"    {region:<30} {count:>6,}")
            print()
            
            print("  Week Ending Dates:")
            for d in summary.get("weekEndingDates", []):
                print(f"    {d}")
            print()
            
            sample = result.get("sampleTasks", [])
            if sample:
                print("  Sample Tasks (first 5):")
                for i, t in enumerate(sample, 1):
                    print(f"    {i}. {t.get('storeName', '?')} | {t.get('barcode', '?')} | {t.get('articleDescription', '?')} | {t.get('action', '?')}")
            print()
            print("=" * 60)
            print("  Everything looks good? Set DRY_RUN = False and run again!")
            print("=" * 60)
        
        elif result.get("async"):
            print(f"[ASYNC] Large file detected, processing in background")
            print(f"[ASYNC] Job ID: {result.get('jobId')}")
            print(f"[ASYNC] Poll: {STOCKFIX_URL}/api/tasks/import/status/{result.get('jobId')}")
            
            job_id = result.get("jobId")
            print()
            print("[ASYNC] Waiting for import to complete...")
            import time
            while True:
                time.sleep(3)
                status_resp = requests.get(f"{STOCKFIX_URL}/api/tasks/import/status/{job_id}", timeout=30)
                if status_resp.status_code == 200:
                    status = status_resp.json()
                    progress = status.get("progress", 0)
                    state = status.get("status", "unknown")
                    processed = status.get("processedRows", 0)
                    total = status.get("totalRows", 0)
                    print(f"  [{state.upper()}] {progress}% - {processed:,}/{total:,} rows", end="\r")
                    
                    if state in ("completed", "failed"):
                        print()
                        if state == "completed":
                            print(f"[DONE] Import completed: {status.get('createdCount', 0):,} tasks created, {status.get('skippedCount', 0):,} skipped")
                        else:
                            print(f"[FAILED] Import failed: {status.get('error', 'Unknown error')}")
                        break
                else:
                    print(f"  [ERROR] Status check failed: {status_resp.status_code}")
                    break
        
        else:
            print(f"[DONE] Import successful!")
            print(f"  Tasks created: {result.get('count', 0):,}")
            print(f"  Message: {result.get('message', '')}")
            diag = result.get("diagnostics", {})
            if diag:
                print(f"  Total rows: {diag.get('totalRows', '?')}")
                print(f"  LINE MANAGER column: {diag.get('lineManagerColumn', '?')}")
                print(f"  Tasks with manager: {diag.get('tasksWithManager', '?')}")
    
    else:
        print(f"[ERROR] Upload failed!")
        try:
            err = response.json()
            print(f"  Error: {err.get('error', response.text)}")
            if "columns" in err:
                print(f"  Detected columns: {err['columns']}")
        except:
            print(f"  Response: {response.text[:500]}")

except requests.exceptions.ConnectionError:
    print(f"[ERROR] Could not connect to {STOCKFIX_URL}")
    print("  Make sure the StockFix app is running!")
except requests.exceptions.Timeout:
    print("[ERROR] Request timed out (120s). The file may be too large.")
    print("  Try again - large files are processed in the background.")
except Exception as e:
    print(f"[ERROR] Upload failed: {e}")

print()
print("Done.")
