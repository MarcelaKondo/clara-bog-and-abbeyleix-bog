#!/usr/bin/env python3
"""
A Python script that consolidates multiple rainfall station CSV files into
a unified monthly summary table with quality checks and optional wide-format output
"""
import pandas as pd
import os
import time
from glob import glob
import argparse
from typing import List

REQUIRED_COLS = [
    "Station Number", "Station Name", "Height", "Easting",
    "Northing", "Latitude", "Longitude", "date", "rain"
]

META_COLS = [
    "Station Number", "Station Name", "Height", "Easting",
    "Northing", "Latitude", "Longitude"
]

def safe_save_csv(df: pd.DataFrame, output_file: str) -> str:
    """
    Safely saves the DataFrame to CSV. If the file is open or locked,
    saves a timestamped version instead and returns the final path.
    """
    try:
        df.to_csv(output_file, index=False)
        print(f"\nSaved: {output_file}")
        return output_file
    except PermissionError:
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        fallback_file = f"{os.path.splitext(output_file)[0]}_{timestamp}.csv"
        df.to_csv(fallback_file, index=False)
        print(f"\nCould not save to '{output_file}'. Saved as '{fallback_file}' instead.")
        return fallback_file

def read_and_validate_csv(file: str, date_format: str) -> pd.DataFrame:
    """Read one CSV, ensure required columns exist, coerce types, drop bad rows."""
    df = pd.read_csv(file, encoding="utf-8")

    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    # Type coercion
    df["date"] = pd.to_datetime(df["date"], format=date_format, errors="coerce")
    df["rain"] = pd.to_numeric(df["rain"], errors="coerce")

    # Drop invalid rows
    df = df.dropna(subset=["date"])
    # Keep rain as NaN if it's missing; we’ll account for it in QA stats
    return df

def load_folder(input_folder: str, date_format: str) -> pd.DataFrame:
    csv_files = glob(os.path.join(input_folder, "*.csv"))
    if not csv_files:
        raise FileNotFoundError("No CSV files found in the folder.")

    frames: List[pd.DataFrame] = []
    for f in csv_files:
        try:
            df = read_and_validate_csv(f, date_format)
            frames.append(df)
            print(f"Loaded: {os.path.basename(f)}  (rows={len(df)})")
        except Exception as e:
            print(f"Skipping {os.path.basename(f)}: {e}")

    if not frames:
        raise RuntimeError("No valid CSVs after validation.")
    return pd.concat(frames, ignore_index=True)

def summarize_monthly(df: pd.DataFrame, missing_threshold: float = 0.2) -> pd.DataFrame:
    """
    Summarize monthly rainfall per station with QA stats.
    missing_threshold: fraction of rows in a month that may be NaN before flagging as incomplete.
    """
    # Year-Month period
    df["YearMonth"] = df["date"].dt.to_period("M")

    group_cols = META_COLS + ["YearMonth"]

    # For QA, we track counts over all rows available for that month+station
    agg = df.groupby(group_cols, dropna=False).agg(
        MonthlyRainfall=("rain", "sum"),
        DaysCount=("rain", "size"),
        MissingCount=("rain", lambda s: s.isna().sum())
    ).reset_index()

    agg["PctMissing"] = (agg["MissingCount"] / agg["DaysCount"]).round(3)
    agg["IncompleteMonth"] = agg["PctMissing"] > missing_threshold

    # Make YearMonth string for CSV friendliness
    agg["YearMonth"] = agg["YearMonth"].astype(str)

    # Order columns nicely
    final_cols = META_COLS + ["YearMonth", "MonthlyRainfall", "DaysCount", "MissingCount", "PctMissing", "IncompleteMonth"]
    agg = agg[final_cols]

    # Sort for readability
    agg = agg.sort_values(["Station Number", "YearMonth"]).reset_index(drop=True)
    return agg

def pivot_wide(monthly_df: pd.DataFrame) -> pd.DataFrame:
    """
    Create a wide-format table: one row per station, columns = YearMonth,
    values = MonthlyRainfall. Keeps one set of station metadata columns.
    """
    id_cols = META_COLS
    wide = monthly_df.pivot_table(
        index=id_cols,
        columns="YearMonth",
        values="MonthlyRainfall",
        aggfunc="sum"  # if duplicates exist, sum them
    ).reset_index()

    # Flatten MultiIndex columns (if any)
    wide.columns = [c if isinstance(c, str) else c[1] for c in wide.columns]
    return wide

def summarize_annual(df: pd.DataFrame, missing_threshold: float = 0.2, min_months: int = 10) -> pd.DataFrame:
    """
    Summarize ANNUAL rainfall per station with QA stats.
    - missing_threshold: fraction of daily rows missing allowed before flagging as incomplete.
    - min_months: minimum distinct months observed in a year to consider it usable.
    """
    # Year and Month (for QA)
    df["Year"] = df["date"].dt.year
    df["Month"] = df["date"].dt.month

    group_cols = META_COLS + ["Year"]

    def _nmonths(x: pd.Series) -> int:
        # distinct (Year, Month) combos present for that group/year
        return pd.MultiIndex.from_arrays([x.dt.year, x.dt.month]).nunique()

    agg = df.groupby(group_cols, dropna=False).agg(
        AnnualRainfall=("rain", "sum"),
        DaysCount=("rain", "size"),
        MissingCount=("rain", lambda s: s.isna().sum()),
        MonthsObserved=("date", _nmonths),
    ).reset_index()

    agg["PctMissing"] = (agg["MissingCount"] / agg["DaysCount"]).round(3)
    agg["MissingMonths"] = (12 - agg["MonthsObserved"]).astype(int)

    # QA flags
    agg["IncompleteYear"] = agg["PctMissing"] > missing_threshold
    agg["InsufficientMonths"] = agg["MonthsObserved"] < min_months
    agg["Flagged"] = agg["IncompleteYear"] | agg["InsufficientMonths"]

    # Order & sort
    final_cols = META_COLS + [
        "Year", "AnnualRainfall", "DaysCount", "MissingCount",
        "PctMissing", "MonthsObserved", "MissingMonths",
        "IncompleteYear", "InsufficientMonths", "Flagged"
    ]
    agg = agg[final_cols].sort_values(["Station Number", "Year"]).reset_index(drop=True)
    return agg


def pivot_wide_annual(annual_df: pd.DataFrame) -> pd.DataFrame:
    """
    Wide-format table: one row per station, columns = Year,
    values = AnnualRainfall. Keeps station metadata columns.
    """
    id_cols = META_COLS
    wide = annual_df.pivot_table(
        index=id_cols,
        columns="Year",
        values="AnnualRainfall",
        aggfunc="sum"
    ).reset_index()

    # Flatten columns robustly (works whether columns are plain Index or MultiIndex)
    if isinstance(wide.columns, pd.MultiIndex):
        wide.columns = [c if isinstance(c, str) else str(c[1]) for c in wide.columns]
    else:
        wide.columns = [str(c) for c in wide.columns]

    # Optional: remove the columns' name (e.g., 'Year') for a cleaner CSV
    wide.columns.name = None

    # Optional: ensure year columns are in numeric order
    year_cols = [c for c in wide.columns if c.isdigit()]
    year_cols_sorted = sorted(year_cols, key=int)
    wide = wide[id_cols + year_cols_sorted]

    return wide

def main():
    parser = argparse.ArgumentParser(description="Summarize monthly rain accumulation per station from CSV files.")
    parser.add_argument("input_folder", help="Folder containing station CSV files")
    parser.add_argument("-o", "--output", default="monthly_rain_summary.csv", help="Path for the long (tidy) summary CSV")
    parser.add_argument("--wide-output", default=None, help="Optional path to save a pivoted wide CSV")
    parser.add_argument("--date-format", default="%Y-%m-%d", help="Date format in the CSV (default: %%Y-%%m-%%d)")
    parser.add_argument("--missing-threshold", type=float, default=0.2,
                        help="Fraction of missing daily rows to flag month as incomplete (default: 0.2)")
    args = parser.parse_args()

    df = load_folder(args.input_folder, args.date_format)

    monthly = summarize_monthly(df, missing_threshold=args.missing_threshold)
    out_path = safe_save_csv(monthly, args.output)

    print("\nPreview (first 10 rows):")
    print(monthly.head(10).to_string(index=False))

    if args.wide_output:
        wide = pivot_wide(monthly)
        wide_path = safe_save_csv(wide, args.wide_output)
        print(f"\ Wide table saved to: {wide_path}")



if __name__ == "__main__":
    main()

