# clara-bog-and-abbeyleix-bog

Here’s a polished README-ready version you can paste in:

```markdown
## Objectives

Ireland’s raised bogs have been heavily altered by drainage and peat extraction, and many are now under restoration. To support decision-making, we need robust evidence of where vegetation is recovering and how management interacts with climate variability. This study compares two contrasting raised bogs— Clara Bog (SAC) and Abbeyleix Bog (community-managed)—to estimate long-term vegetation change and recent land-cover dynamics using harmonised satellite data.

Research question: Can the combined effects of climate variability and site management on vegetation status and land cover in Irish raised bogs be separated and described?

### Specific goals

O1 — Quantify long-term vegetation trends (1985–2025).
Estimate winter and summer NDVI trends for both sites using Mann–Kendall and Theil–Sen:
- Report effect sizes (Sen’s slope, NDVI yr⁻¹), Kendall’s τ, and statistical significance by season and site.

O2 — Compare seasons and sites; identify contributing factors.
- Contrast greening trends between winter vs summer and Abbeyleix vs Clara.  
- Correlate variations with hydrology, management interventions, and climatic drivers, documenting partial effects and interactions.

O3 — Map spatial dynamics and land-cover change (2017–2025).  
- Data: Sentinel-2 Level-2A (10 m) composites cloud-masked via the Scene Classification Layer.  
- Predictors: surface reflectance bands + indices (NDVI, NDMI, NDWI, NBR, EVI).  
- Models: supervised classifiers— Random Forest (primary), with Gradient Tree Boost** and SVM for comparison; training on 2017–2019 samples.  
- Outputs: five-class maps (Water, Raised Bog, Other Peat, Forest/Scrub, Other) for 2017, 2020, and 2024/25; reprojected to ITM (EPSG:2157).  
- Validation: stratified 20% hold-out; report overall accuracy (OA), class-specific producer’s/user’s accuracy (PA/UA), and Cohen’s κ.  
- Change analysis: compute class area and transition matrices between dates; summarise by ecotope (central, sub-central, marginal, flush/soak) to distinguish dome recovery from edge processes.

Outcome: An integrated remote-sensing assessment of peatland dynamics and restoration progress to inform future conservation actions.
```


## Repo structure
```
.
├── src/                 # Python source code (importable package/modules)
├── notebooks/           # Jupyter notebooks
├── data/
│   ├── raw/             # Original data (read-only; use LFS for large binaries)
│   └── processed/       # Derived data / outputs
├── docs/                # Documentation / reports
├── .github/workflows/   # CI config
├── .gitattributes       # Git LFS tracking rules
├── .gitignore
├── LICENSE
└── requirements.txt
```

## Getting started

### 1) Create and activate a virtual environment
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
```

### 2) Install dependencies
```bash
pip install -r requirements.txt
```

### 3) (Optional) Enable Git LFS (recommended for GeoTIFFs and shapefiles)
Install Git LFS from https://git-lfs.com/ then run:
```bash
git lfs install
git lfs track "*.tif" "*.tiff" "*.jp2" "*.img" "*.hdf" "*.nc" "*.SAFE" "*.gpkg" "*.shp" "*.dbf" "*.shx" "*.prj" "*.cpg"
git add .gitattributes
```

### 4) Run notebooks or scripts
- Place raw inputs in `data/raw/`
- Save derived outputs to `data/processed/`
- Keep heavy binaries tracked by LFS

## Repro tips
- Commit small, review with Pull Requests
- Use branches for new features/experiments
- Tag releases for milestones

## License
MIT (see `LICENSE`).
