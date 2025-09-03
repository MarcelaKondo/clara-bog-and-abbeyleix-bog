# PROJECT_NAME

Short description of your project (what it does, why it exists).

## Features
- Reproducible Python environment
- Clear repo structure for code, notebooks, and data
- GitHub Actions CI (lint) ready
- Git LFS set up for large geospatial files (GeoTIFFs, shapefiles, etc.)

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
