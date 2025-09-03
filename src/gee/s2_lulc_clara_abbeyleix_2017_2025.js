// Sentinel-2 LULC (5 classes) for Clara & Abbeyleix, 2017–2025: Jun–Aug composites with cloud-prob masking, spectral indices, and terrain features.
// Trains on 2018 site labels with class-conditional sampling (RF by default), classifies each year, and exports RGB rasters to Drive (EPSG:2157).

/***********************
 Sentinel-2 LULC (5 classes) — Clara + Abbeyleix
 Classes:
   0 Water
   1 Raised bog (610)
   2 Other peat (620,630,640,650)
   3 Forest/Scrub (410–470)
   4 Other (grass/heath/swamp + cultivated + artificial/exposed/coastal)
***********************/

// ===================== PARAMS =====================
var YEARS            = ee.List.sequence(2017, 2025);
var MONTH_START      = 6;      // Jun (greener window)
var MONTH_END        = 8;      // Aug (better than September)
var CLOUD_PCT        = 40;
var CLOUD_PROB_TH    = 55;     // S2 cloud prob threshold
var DILATE_CLOUD_PX  = 2;
var DILATE_SHADOW_PX = 1;

var TRAIN_FRACTION   = 0.8;
var SCALE            = 10;
var TARGET_CRS       = 'EPSG:2157';

// Sampling control
var APPLY_CLASS_CONDITIONAL   = true;           // restrict peat classes to peat region
var PEAT_CLASSES              = ee.List([1, 2]); // raised bog + other peat
var LIMIT_NONPEAT_TO_ANTIPEAT = true;           // non-peat sampled outside peat
var PER_CLASS_CAP             = 600;
var MIN_PER_CLASS             = 200;

// Classifier to use: 'RF' | 'GBT' | 'SVM'
var ALGO = 'RF';

// ===================== AOIs + LABEL ASSETS  =====================
var AOI_CLARA = ee.FeatureCollection('projects/astute-city-466615-g2/assets/clara').geometry();
var AOI_ABB   = ee.FeatureCollection('projects/astute-city-466615-g2/assets/abbeyleix').geometry();
var AOI       = AOI_CLARA.union(AOI_ABB, 1);

var MLC_2018_CLARA = 'projects/astute-city-466615-g2/assets/land_cover_Clara';
var MLC_2018_ABB   = 'projects/astute-city-466615-g2/assets/land_cover_Abbeyleix';

Map.centerObject(AOI, 11);

// ===================== DEM + TERRAIN =====================
// NASA 30m Digital Elevation Model
var DEM = ee.Image('NASA/NASADEM_HGT/001').select('elevation'); 
DEM = DEM.clip(AOI);

function terrainBands(refImg) {
  var dem10 = DEM
    .resample('bilinear')
    .reproject({crs: refImg.projection(), scale: SCALE})
    .rename('elev');

  var terr   = ee.Terrain.products(dem10);
  var slope  = terr.select('slope').rename('slope');
  var aspect = terr.select('aspect');
  var aRad   = aspect.multiply(Math.PI/180);
  var eastness  = aRad.sin().rename('eastness');
  var northness = aRad.cos().rename('northness');

  var k30m  = ee.Kernel.circle({radius: 30,  units: 'meters', normalize: true});
  var k100m = ee.Kernel.circle({radius: 100, units: 'meters', normalize: true});
  var k300m = ee.Kernel.circle({radius: 300, units: 'meters', normalize: true});

  var rough  = dem10.reduceNeighborhood({reducer: ee.Reducer.stdDev(), kernel: k30m}).rename('rough');
  var tpi100 = dem10.subtract(dem10.reduceNeighborhood({reducer: ee.Reducer.mean(), kernel: k100m})).rename('TPI_100m');
  var tpi300 = dem10.subtract(dem10.reduceNeighborhood({reducer: ee.Reducer.mean(), kernel: k300m})).rename('TPI_300m');

  // VRM (vector ruggedness)
  var sRad = slope.multiply(Math.PI/180);
  var x = sRad.sin().multiply(aRad.cos());
  var y = sRad.sin().multiply(aRad.sin());
  var z = sRad.cos();
  var meanX = x.reduceNeighborhood({reducer: ee.Reducer.mean(), kernel: k100m});
  var meanY = y.reduceNeighborhood({reducer: ee.Reducer.mean(), kernel: k100m});
  var meanZ = z.reduceNeighborhood({reducer: ee.Reducer.mean(), kernel: k100m});
  var vrm = ee.Image(1).subtract(meanX.pow(2).add(meanY.pow(2)).add(meanZ.pow(2)).sqrt()).rename('VRM');

  var m = refImg.mask().reduce(ee.Reducer.min());
  return ee.Image.cat(dem10, slope, eastness, northness, rough, tpi100, tpi300, vrm).updateMask(m);
}

// ===================== CLOUD MASKING =====================
function maskWithCloudProb(img) {
  var prob = ee.Image(ee.Algorithms.If(
    img.get('cloud_mask'),
    ee.Image(img.get('cloud_mask')).select('probability'),
    ee.Image.constant(0)
  ));
  var clouds  = prob.gte(CLOUD_PROB_TH).focal_max(DILATE_CLOUD_PX);
  var hasSCL  = img.bandNames().contains('SCL');
  var scl     = ee.Image(ee.Algorithms.If(hasSCL, img.select('SCL'), ee.Image(0)));
  var shadows = ee.Image(ee.Algorithms.If(hasSCL, scl.eq(3), ee.Image(0))).focal_max(DILATE_SHADOW_PX);
  var snow    = ee.Image(ee.Algorithms.If(hasSCL, scl.eq(11), ee.Image(0)));
  return img.updateMask(clouds.not()).updateMask(shadows.not()).updateMask(snow.not());
}
function maskS2SR(img) {
  var scl = img.select('SCL');
  var mask = scl.neq(3).and(scl.neq(7)).and(scl.neq(8)).and(scl.neq(9))
    .and(scl.neq(10)).and(scl.neq(11)).and(scl.neq(1));
  return img.updateMask(mask);
}

// ===================== BAND HARMONIZATION & INDICES =====================
function addIndices(img) {
  var scaled = img.toFloat().divide(10000);
  var ndvi = scaled.normalizedDifference(['B8','B4']).rename('NDVI');
  var ndmi = scaled.normalizedDifference(['B8','B11']).rename('NDMI');
  var ndwi = scaled.normalizedDifference(['B3','B8']).rename('NDWI');
  var nbr  = scaled.normalizedDifference(['B8','B12']).rename('NBR');
  var evi  = scaled.expression(
    '2.5*((NIR-RED)/(NIR+6*RED-7.5*BLUE+1))',
    {NIR: scaled.select('B8'), RED: scaled.select('B4'), BLUE: scaled.select('B2')}
  ).rename('EVI');
  return scaled.addBands([ndvi, ndmi, ndwi, nbr, evi]);
}
function harmonizeBands(img) {
  var bands10 = ['B2','B3','B4','B8'];
  var bands20 = ['B5','B6','B7','B8A','B11','B12'];
  var present = img.select(bands10.concat(bands20)).resample('bilinear');
  return addIndices(present);
}

// ===================== S2 COMPOSITE (adds terrain) =====================
function getS2Composite(year) {
  year  = ee.Number(year);
  var start = ee.Date.fromYMD(year, MONTH_START, 1);
  var end   = ee.Date.fromYMD(year, MONTH_END, 1).advance(1, 'month'); 

  var srRaw = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(AOI).filterDate(start, end)
      .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', CLOUD_PCT));
  var s2cp = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
      .filterBounds(AOI).filterDate(start, end);

  var join  = ee.Join.saveFirst('cloud_mask');
  var onIdx = ee.Filter.equals({leftField:'system:index', rightField:'system:index'});
  var srJ   = ee.ImageCollection(join.apply(srRaw, s2cp, onIdx)).map(maskWithCloudProb);

  var useQA = ee.Algorithms.If(srJ.size().gt(0), srJ, srRaw.map(maskS2SR));
  var srLoose = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(AOI).filterDate(start, end).map(maskS2SR);
  var finalCol = ee.ImageCollection(ee.Algorithms.If(ee.ImageCollection(useQA).size().gt(0), useQA, srLoose));

  var colFeatsReady = ee.ImageCollection(finalCol).map(harmonizeBands);
  var med = colFeatsReady.median();
  var p75 = colFeatsReady.select(['NDVI','NDMI']).reduce(ee.Reducer.percentile([75])); // NDVI_p75, NDMI_p75

  var out = med.addBands(p75).clip(AOI);
  out = out.addBands(terrainBands(out));
  return out.set('year', year);
}

// ===================== CLASS MAPPING =====================
var mlcCodes = [
  810,820,830,840,850,  // Water
  610,                  // Raised bog
  620,630,640,650,      // Other peat
  410,420,430,440,450,460,470, // Forest/Scrub
  510,520,530,540,570,710,720,730,310, // Other
  110,120,130,210,220,230,240,250,550,560
];
var modelCodes = [
  0,0,0,0,0,  // Water -> 0
  1,          // Raised bog -> 1
  2,2,2,2,    // Other peat -> 2
  3,3,3,3,3,3,3, // Forest/Scrub -> 3
  4,4,4,4,4,4,4,4,4,  // Other -> 4
  4,4,4,4,4,4,4,4,4,4
];
var classNames   = ['Water','Raised bog','Other peat','Forest/Scrub','Other'];
var classPalette = ['#4C78A8','#A6D96A','#E9C46A','#1B9E77','#F4A261'];

// ===================== LOAD + MERGE LABELS =====================
function loadMLC(asset, siteTag){
  var fc = ee.FeatureCollection(asset).filterBounds(AOI);
  var first = ee.Feature(fc.first());
  var names = first.propertyNames();
  var L2 = ee.String(ee.Algorithms.If(
    names.contains('LEVEL_2_ID'), 'LEVEL_2_ID',
    ee.Algorithms.If(names.contains('LEVE_2'), 'LEVE_2', 'LEVEL_2_ID')
  ));
  return fc
    .map(function(f){ return f.set('code_int', ee.Number.parse(f.get(L2))).set('site', siteTag); })
    .filter(ee.Filter.notNull(['code_int']));
}
var fcClara = loadMLC(MLC_2018_CLARA, 'CLARA');
var fcAbb   = loadMLC(MLC_2018_ABB,   'ABBEYLEIX');
var fc      = fcClara.merge(fcAbb);

var mlc2018 = ee.Image.constant(255).toInt()
  .paint({featureCollection: fc, color: 'code_int'})
  .rename('code')
  .clip(AOI);
var labelImg  = mlc2018.remap(mlcCodes, modelCodes, 255).rename('label');
var labelMask = labelImg.neq(255);
Map.addLayer(labelImg.randomVisualizer(), {}, 'Labels (5 classes, Clara+Abbeyleix)', false);

// peat mask (from labels)
var PEAT_MASK_ASSET = null;
var peatMask = PEAT_MASK_ASSET
  ? ee.Image(PEAT_MASK_ASSET).rename('peat').gt(0)
  : mlc2018.remap([610,620,630,640,650],[1,1,1,1,1],0).rename('peat').gt(0);

// ===================== TRAINING DATA =====================
// Multi-year training composite
var compTrain = ee.ImageCollection([2017,2018,2019].map(getS2Composite)).median();

var FEATURES = [
  // reflectance
  'B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
  // indices
  'NDVI','NDMI','NDWI','NBR','EVI',
  // extra seasonal stats
  'NDVI_p75','NDMI_p75',
  // DEM-derived
  'elev','slope','eastness','northness','rough','TPI_100m','TPI_300m','VRM'
];

// Masks: clean edges + class-conditional regions
var pureMask = labelImg.focal_mode(1).eq(labelImg);
var baseMask = labelMask.and(pureMask);

var condMask = ee.Image(1);
if (APPLY_CLASS_CONDITIONAL) {
  var nonPeatRegion = ee.Image(ee.Algorithms.If(LIMIT_NONPEAT_TO_ANTIPEAT, peatMask.not(), ee.Image(1)));
  var presentDict = labelImg.updateMask(baseMask).reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(), geometry: AOI, scale: SCALE, maxPixels: 1e13
  }).get('label');
  var classValues = ee.List(ee.Dictionary(presentDict).keys())
                     .map(function(k){ return ee.Number.parse(k); }).sort();
  condMask = ee.ImageCollection.fromImages(classValues.map(function(c){
    c = ee.Number(c);
    var region = ee.Image(ee.Algorithms.If(PEAT_CLASSES.contains(c), peatMask, nonPeatRegion));
    return labelImg.eq(c).and(region);
  })).max();
  baseMask = baseMask.and(condMask);
}

var trainImg = compTrain.select(FEATURES).addBands(labelImg).updateMask(baseMask);

// Availability - check if there is four or five class (abbeyleix problem)
var availDict = ee.Dictionary(trainImg.select('label')
  .reduceRegion({reducer: ee.Reducer.frequencyHistogram(), geometry: AOI, scale: SCALE, maxPixels: 1e13})
  .get('label'));
var classes = availDict.keys().map(function(k){ return ee.Number.parse(k); }).sort();
print('Classes present after masks (union):', classes);

// Balanced per-class target
var classPoints;
{
  var counts   = classes.map(function(c){ return ee.Number(availDict.get(ee.String(c))).toInt(); });
  var minAvail = ee.Number(ee.List(counts).reduce(ee.Reducer.min()));
  var target   = minAvail.min(PER_CLASS_CAP).max(MIN_PER_CLASS).toInt();
  classPoints  = classes.map(function(_){ return target; });
  print('Equalized per-class target (per site uses same target):', target);
}

// Per-site sampling
function sampleSite(region, tag){
  var s = trainImg.stratifiedSample({
    numPoints: 0,
    classBand: 'label',
    region: region,
    scale: SCALE,
    classValues: classes,
    classPoints: classPoints,
    dropNulls: true,
    geometries: true,
    seed: 42
  }).map(function(f){ return f.set('site', tag); });
  return s;
}
var sampleClara = sampleSite(AOI_CLARA, 'CLARA');
var sampleAbb   = sampleSite(AOI_ABB,   'ABBEYLEIX');

var RB_BOOST_ABB = 200; // add N extra Raised-bog samples in Abbeyleix to stabilize class 1 there (0 to disable).
var extraAbbRB = ee.FeatureCollection(ee.Algorithms.If(
  RB_BOOST_ABB > 0,
  trainImg.stratifiedSample({
    numPoints: 0, classBand: 'label', region: AOI_ABB, scale: SCALE,
    classValues: [1], classPoints: [RB_BOOST_ABB],
    dropNulls: true, geometries: true, seed: 99
  }).map(function(f){ return f.set('site','ABBEYLEIX'); }),
  ee.FeatureCollection([])
));

var sample = sampleClara.merge(sampleAbb).merge(extraAbbRB).randomColumn('rand', 42);
print('Sample counts by label (both sites):', sample.aggregate_histogram('label'));

// Train/Test split
var trainSet = sample.filter(ee.Filter.lte('rand', TRAIN_FRACTION));
var testSet  = sample.filter(ee.Filter.gt('rand', TRAIN_FRACTION));
print('Training size:', trainSet.size(), 'Test size:', testSet.size());

// ===================== CLASSIFIER =====================
function makeClassifier(){
  if (ALGO === 'RF')  return ee.Classifier.smileRandomForest({numberOfTrees:700, variablesPerSplit:5, minLeafPopulation:5, bagFraction:0.7, seed:42});
  if (ALGO === 'GBT') return ee.Classifier.smileGradientTreeBoost(350, 0.05, 0.7, 64);
  if (ALGO === 'SVM') return ee.Classifier.libsvm({kernelType:'RBF', gamma:0.5, cost:10});
  throw 'Unknown ALGO: ' + ALGO;
}
var clf   = makeClassifier();
var model = clf.train({features: trainSet, classProperty: 'label', inputProperties: FEATURES});

// ===================== EVALUATION =====================
var testPred = testSet.classify(model);
var cm = testPred.errorMatrix('label', 'classification');
print('Confusion matrix (rows=truth, cols=pred):', cm);
print('Overall accuracy:', cm.accuracy());
print('Kappa:', cm.kappa());
print('Producers accuracy:', cm.producersAccuracy());
print('Users accuracy:', cm.consumersAccuracy());

print('Truth counts (test):', testSet.aggregate_histogram('label'));
print('Pred counts  (test):', testPred.aggregate_histogram('classification'));

// =====================APPLY TO ALL YEARS =====================
var comps = ee.ImageCollection(YEARS.map(getS2Composite));
var classifiedCol = comps.map(function(img){
  var y = ee.Number(img.get('year'));
  return img.select(FEATURES)
    .classify(model)
    .toInt8()
    .rename('class')
    .set('year', y)
    .set('method', ALGO);
});

// ----Show specific LULC years on the map ----
function addYearLayer(y, visible) {
  var im = ee.Image(classifiedCol.filter(ee.Filter.eq('year', y)).first());
  Map.addLayer(im, {min: 0, max: 4, palette: classPalette}, 'LULC ' + y + ' (' + ALGO + ')', visible);
}
addYearLayer(2024, true);
addYearLayer(2020, true);
addYearLayer(2017, true);

// ===================== EXPORTS =====================
var DRIVE_FOLDER = 'LULC_' + ALGO;

function exportRGBFromClass(img, basename) {
  var rgb = img.toInt8()
               .visualize({min: 0, max: 4, palette: classPalette})
               .clip(AOI);

  Export.image.toDrive({
    image: rgb,
    description: basename,
    folder: DRIVE_FOLDER,        
    fileNamePrefix: basename,    
    region: AOI,
    scale: SCALE,
    crs: TARGET_CRS,
    maxPixels: 1e13
  });
}
 YEARS.getInfo().forEach(function(y){
   var cls = ee.Image(classifiedCol.filter(ee.Filter.eq('year', y)).first()).select('class');
   exportRGBFromClass(cls, 'LULC_' + ALGO + '_' + y + '_RGB');
 });

// ===================== LEGEND =====================
function addLegend(names, palette, title){
  var legend = ui.Panel({style: {position: 'bottom-left'}});
  legend.add(ui.Label({value: title, style: {fontWeight: 'bold'}}));
  for (var i=0; i<names.length; i++){
    var colorBox = ui.Label({style: {backgroundColor: palette[i], padding: '8px', margin: '0 4px 4px 0'}});
    legend.add(ui.Panel([colorBox, ui.Label(names[i])], ui.Panel.Layout.Flow('horizontal')));
  }
  Map.add(legend);
}
addLegend(classNames, classPalette, 'LULC classes');



