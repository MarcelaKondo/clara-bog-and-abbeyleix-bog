# -*- coding: utf-8 -*-
"""
Clara Bog — NDVI (30 m only) + rainfall:
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib import ticker as mticker
from pathlib import Path
from typing import Dict, Tuple

# ----------------- paths (CLARA) -----------------
CSV_PATH   = "ndvi_ndwi_30m_clara_cc25.csv"       # Clara
RAIN_CSV   = "clara_nn_annual_1981_to_2025.csv"   # annual rainfall (NN)
RAIN_LABEL = "Annual Rainfall (NN)"

# ----------------- NDVI loader (robust) -----------------
def _detect_ndvi_column(df: pd.DataFrame) -> str:
    cols_lower = {c.lower(): c for c in df.columns}
    for key in ("ndvi", "ndvi_use", "ndvi_harmonized"):
        if key in cols_lower:
            return cols_lower[key]
    numerics = []
    for c in df.columns:
        s = pd.to_numeric(df[c], errors="coerce")
        if s.notna().sum() == 0:
            continue
        numerics.append((c, s.median()))
    plausible = [(c, m) for c, m in numerics if 0.2 <= (m if pd.notna(m) else -1) <= 0.9]
    if plausible:
        plausible.sort(key=lambda x: x[1], reverse=True)
        return plausible[0][0]
    numerics.sort(key=lambda x: (x[1] if pd.notna(x[1]) else -1e9), reverse=True)
    return numerics[0][0]

def load_ndvi_table(csv_path: str) -> pd.DataFrame:
    if not Path(csv_path).exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")
    df = pd.read_csv(csv_path)

    # standardize
    if "season" in df.columns:
        df["season"] = df["season"].astype(str).str.upper()
    if "year" not in df.columns:
        raise ValueError("NDVI CSV must contain a 'year' column.")
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64").dropna().astype(int)

    ndvi_col = _detect_ndvi_column(df)
    out = df.copy()
    out["NDVI"] = pd.to_numeric(df[ndvi_col], errors="coerce")

    # optional: keep true NDWI if present
    if "NDWI" in df.columns and ndvi_col != "NDWI":
        out["NDWI_true"] = pd.to_numeric(df["NDWI"], errors="coerce")

    out = out.dropna(subset=["NDVI", "season", "year"]).sort_values("year").reset_index(drop=True)
    return out

def build_series(df: pd.DataFrame, season: str, start_year: int = 1984, min_ndvi: float = 0.25) -> pd.DataFrame:
    """Return one NDVI value per year for the given season (NDVI >= min_ndvi)."""
    d = (
        df[df["season"].eq(season.upper())]
        .loc[:, ["year", "NDVI"]]
        .dropna()
        .sort_values("year")
        .drop_duplicates(subset=["year"], keep="last")
    )
    d = d[d["year"] >= start_year]
    d = d[d["NDVI"] >= min_ndvi]
    return d.reset_index(drop=True)

# ----------------- rainfall loader -----------------
def load_rainfall(csv_path: str) -> pd.DataFrame:
    if not Path(csv_path).exists():
        raise FileNotFoundError(f"Rainfall CSV not found: {csv_path}")
    r = pd.read_csv(csv_path)
    year_col = next((c for c in r.columns if str(c).strip().lower() == "year"), None)
    if year_col is None:
        raise ValueError("Rainfall CSV must have a 'Year' column.")
    val_col = next((c for c in ["Value_mm","Value","Mean_mm","MEAN","Mean","mean"] if c in r.columns), None)
    if val_col is None:
        raise ValueError("Rainfall CSV missing a rainfall value column.")
    r = r[[year_col, val_col]].copy()
    r.columns = ["year", "rain_mm"]
    r["year"] = pd.to_numeric(r["year"], errors="coerce").astype("Int64").dropna().astype(int)
    r["rain_mm"] = pd.to_numeric(r["rain_mm"], errors="coerce")
    r = r.dropna(subset=["rain_mm"]).sort_values("year").drop_duplicates(subset=["year"], keep="last")
    return r

# ----------------- plotting -----------------
def plot_ndvi_with_rain(df, season: str, rain_df: pd.DataFrame,
                        site_label: str = "Clara Bog",
                        outfile: str = None, y_range=(0, 0.9),
                        rain_style="bars", rain_ylim=(500, 1800)):
    d = build_series(df, season)
    if d.empty:
        print(f"No NDVI data for {season}."); return
    years = d["year"].to_numpy()
    ndvi  = d["NDVI"].to_numpy()
    xmin, xmax = int(years.min()), int(years.max())

    rain = rain_df[(rain_df["year"] >= xmin) & (rain_df["year"] <= xmax)].copy()

    fig, ax = plt.subplots(figsize=(12, 5))
    ax.plot(years, ndvi, marker="o", lw=2, ms=4, label="NDVI")

    ax2 = ax.twinx()
    if not rain.empty:
        if rain_style.lower() == "bars":
            ax2.bar(rain["year"], rain["rain_mm"], width=0.7, alpha=0.35, label=RAIN_LABEL, zorder=0)
        else:
            ax2.plot(rain["year"], rain["rain_mm"], lw=2, alpha=0.65, label=RAIN_LABEL)

    ax.set_title(f"{season.title()} — {site_label}: NDVI with Annual Rainfall")
    ax.set_xlabel("Year")
    ax.set_ylabel("NDVI")
    ax.set_ylim(*y_range)
    ax.set_xlim(xmin, xmax)
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_locator(mticker.MaxNLocator(integer=True, nbins=14, min_n_ticks=6))
    ax2.set_ylabel("Rainfall (mm)")
    if rain_ylim is not None:
        ax2.set_ylim(*rain_ylim)

    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    if h1 or h2:
        ax.legend(h1+h2, l1+l2, loc="upper left", frameon=True)

    plt.margins(x=0.01)
    plt.tight_layout()
    if outfile:
        plt.savefig(outfile, dpi=200)
    plt.show()

# ----------------- correlations (with lags) -----------------
def prepare_merged(df: pd.DataFrame, rain_df: pd.DataFrame, season: str,
                   min_ndvi: float = 0.25) -> pd.DataFrame:
    d = build_series(df, season).copy()
    if min_ndvi is not None:
        d = d[d["NDVI"] >= min_ndvi]
    merged = pd.merge(d.rename(columns={"NDVI": "ndvi"}),
                      rain_df.rename(columns={"rain_mm": "rain"}),
                      on="year", how="inner").sort_values("year")
    return merged

def corr_with_p(x: np.ndarray, y: np.ndarray) -> Dict[str, Tuple[float, float]]:
    """Return Pearson/Spearman/Kendall coefficients (+ p-values)."""
    try:
        from scipy.stats import pearsonr, spearmanr, kendalltau
        return {"pearson": pearsonr(x, y),
                "spearman": spearmanr(x, y),
                "kendall": kendalltau(x, y)}
    except Exception:
        return {"pearson":  (pd.Series(x).corr(pd.Series(y), "pearson"),  np.nan),
                "spearman": (pd.Series(x).corr(pd.Series(y), "spearman"), np.nan),
                "kendall":  (pd.Series(x).corr(pd.Series(y), "kendall"),  np.nan)}

def lagged_correlations(df: pd.DataFrame, rain_df: pd.DataFrame, season: str,
                        lags = (-2, -1, 0, 1, 2), min_ndvi: float = 0.25) -> pd.DataFrame:
    """
    Correlate NDVI_t with Rainfall_{t+lag}. Example: lag=-1 → rain leads NDVI by one year.
    """
    base = prepare_merged(df, rain_df, season, min_ndvi=min_ndvi)
    rows = []
    for lag in lags:
        tmp = base.copy()
        tmp["rain_lag"] = tmp["rain"].shift(lag * -1)  # NDVI_t vs Rain_{t+lag}
        tmp = tmp.dropna(subset=["ndvi", "rain_lag"])
        if len(tmp) < 3:
            continue
        stat = corr_with_p(tmp["ndvi"].to_numpy(), tmp["rain_lag"].to_numpy())
        rows.append({
            "season": season, "lag_years": lag, "n": len(tmp),
            "pearson_r":  stat["pearson"][0],  "pearson_p":  stat["pearson"][1],
            "spearman_r": stat["spearman"][0], "spearman_p": stat["spearman"][1],
            "kendall_tau":stat["kendall"][0],  "kendall_p":  stat["kendall"][1],
        })
    return pd.DataFrame(rows).sort_values(["season", "lag_years"])

# ----------------- scatter + OLS line -----------------
from scipy.stats import linregress

def scatter_with_regression(df, rain_df, season: str, lag: int = 0,
                            min_ndvi: float = 0.25, outfile: str = None):
    base = prepare_merged(df, rain_df, season, min_ndvi=min_ndvi)
    base["rain_lag"] = base["rain"].shift(lag * -1)
    base = base.dropna(subset=["ndvi", "rain_lag"])
    if base.empty:
        print("No overlapping years for this lag."); return
    x = base["rain_lag"].to_numpy()
    y = base["ndvi"].to_numpy()
    slope, intercept, r_val, p_val, _ = linregress(x, y)

    plt.figure(figsize=(6,5))
    plt.scatter(x, y, s=60, edgecolor="k")
    plt.plot(x, intercept + slope*x, lw=2)
    plt.title(f"{season} NDVI vs Rainfall (lag {lag}) — Clara")
    plt.xlabel("Annual Rainfall (mm)")
    plt.ylabel("NDVI")
    plt.text(0.05, 0.95, f"r = {r_val:.2f}\np = {p_val:.3f}",
             transform=plt.gca().transAxes, ha="left", va="top",
             bbox=dict(facecolor="white", alpha=0.7, edgecolor="none"))
    plt.tight_layout()
    if outfile:
        plt.savefig(outfile, dpi=200)
    plt.show()

# ----------------- example run -----------------
if __name__ == "__main__":
    ndvi_df = load_ndvi_table(CSV_PATH)
    rain_df = load_rainfall(RAIN_CSV)

    # Plots
    plot_ndvi_with_rain(ndvi_df, "SUMMER", rain_df, site_label="Clara Bog",
                        outfile="clara_summer_ndvi_rain.png")
    plot_ndvi_with_rain(ndvi_df, "WINTER", rain_df, site_label="Clara Bog",
                        outfile="clara_winter_ndvi_rain.png")

    # Correlations with lags
    corr_s = lagged_correlations(ndvi_df, rain_df, "SUMMER", lags=(-2,-1,0,1,2), min_ndvi=0.25)
    corr_w = lagged_correlations(ndvi_df, rain_df, "WINTER", lags=(-2,-1,0,1,2), min_ndvi=0.25)
    print("\n=== Clara — Summer: NDVI vs Rainfall (lags in years) ===")
    print(corr_s.to_string(index=False, float_format=lambda v: f"{v:0.3f}"))
    print("\n=== Clara — Winter: NDVI vs Rainfall (lags in years) ===")
    print(corr_w.to_string(index=False, float_format=lambda v: f"{v:0.3f}"))

    # Example scatters (tweak lags as needed)
    scatter_with_regression(ndvi_df, rain_df, "SUMMER", lag=0,
                            outfile="clara_scatter_summer_lag0.png")
    scatter_with_regression(ndvi_df, rain_df, "WINTER", lag=2,
                            outfile="clara_scatter_winter_lag2.png")


