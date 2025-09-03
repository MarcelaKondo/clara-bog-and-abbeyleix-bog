from station1 import load_folder, summarize_monthly, safe_save_csv, pivot_wide, summarize_annual, pivot_wide_annual

INPUT_DIR = r"C:\Users\marce\PycharmProjects\station\modifiedclara"
OUT_LONG = r"C:\Users\marce\PycharmProjects\station\modifiedclara\claramonthly_rain_summary.csv"
OUT_WIDE = r"C:\Users\marce\PycharmProjects\station\modifiedclara\claramonthly_rain_wide.csv"

# New annual outputs
OUT_ANNUAL = r"C:\Users\marce\PycharmProjects\station\modifiedclara\claraannual_rain_summary.csv"
OUT_ANNUAL_WIDE = r"C:\Users\marce\PycharmProjects\station\modifiedclara\\claraannual_rain_wide.csv"

DATE_FMT = "%d-%b-%y"  # change to "%d/%m/%Y" if needed

df = load_folder(INPUT_DIR, DATE_FMT)

# --- Monthly ---
monthly = summarize_monthly(df, missing_threshold=0.2)
safe_save_csv(monthly, OUT_LONG)
wide = pivot_wide(monthly)
safe_save_csv(wide, OUT_WIDE)

# --- Annual ---
annual = summarize_annual(df, missing_threshold=0.2, min_months=10)
safe_save_csv(annual, OUT_ANNUAL)
annual_wide = pivot_wide_annual(annual)
safe_save_csv(annual_wide, OUT_ANNUAL_WIDE)

print("Done. Previews:")
print("\nMonthly (first 10):")
print(monthly.head(10).to_string(index=False))
print("\nAnnual (first 10):")
print(annual.head(10).to_string(index=False))
