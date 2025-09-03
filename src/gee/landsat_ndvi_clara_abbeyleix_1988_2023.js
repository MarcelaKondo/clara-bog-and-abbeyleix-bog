// EE workflow to build Jul–Aug median NDVI composites (1988–2023) for Clara & Abbeyleix from Landsat 4–9 (cloud-masked, scaled)
// Visualises layers and exports NDVI rasters (EPSG:2157) plus a CSV of NDVI-bin area/percentage stats by site/year.

/*********************** Import geometries  ***************************/

var aoiAbbeyleix = aoiAbbeyleix;
var aoiClara     = aoiClara;

/*********************** parameters  ***************************/

// 2) Season window 
var DOY_START = 196;   // ~Jul 15
var DOY_END   = 227;   // ~Aug 15

//minimum of clear observations required per pixel
var MIN_OBS = 1;

// Landsat 7 after 2003 (SLC-off). 
var ALLOW_LE07_SLC_OFF = true;

/*********************** MASKING & PREP ***************************/
//Landsat C2 L2 scale/offset for SR
var SR_SCALE = 0.0000275, SR_OFF = -0.2;

// QA mask (dilated cloud, cloud, shadow, snow, cirrus)
function maskL2(img){
  var qa = img.select('QA_PIXEL');
  var clear = qa.bitwiseAnd(1<<1).eq(0)    // dilated cloud
    .and(qa.bitwiseAnd(1<<3).eq(0))        // cloud
    .and(qa.bitwiseAnd(1<<4).eq(0))        // shadow
    .and(qa.bitwiseAnd(1<<5).eq(0))        // snow
    .and(qa.bitwiseAnd(1<<2).eq(0));       // cirrus
  return img.updateMask(clear);
}

// Map sensors to common bands (red, nir, green) and apply scale/offset
function prepLT45(i){ i = maskL2(i);
  return ee.Image.cat(
    i.select('SR_B3').multiply(SR_SCALE).add(SR_OFF).rename('red'),
    i.select('SR_B4').multiply(SR_SCALE).add(SR_OFF).rename('nir'),
    i.select('SR_B2').multiply(SR_SCALE).add(SR_OFF).rename('green')
  ).copyProperties(i, ['system:time_start']);
}
function prepLE07(i){ return prepLT45(i); }
function prepLC089(i){ i = maskL2(i);
  return ee.Image.cat(
    i.select('SR_B4').multiply(SR_SCALE).add(SR_OFF).rename('red'),
    i.select('SR_B5').multiply(SR_SCALE).add(SR_OFF).rename('nir'),
    i.select('SR_B3').multiply(SR_SCALE).add(SR_OFF).rename('green')
  ).copyProperties(i, ['system:time_start']);
}

// build a merged collection for ONE year and DOY window.
function landsat30Year(aoi, year, doyStart, doyEnd){
  var y = ee.Filter.calendarRange(year, year, 'year');
  var d = ee.Filter.dayOfYear(doyStart, doyEnd);

  var lt4 = ee.ImageCollection('LANDSAT/LT04/C02/T1_L2').filter(y).filter(d).filterBounds(aoi).map(prepLT45);
  var lt5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').filter(y).filter(d).filterBounds(aoi).map(prepLT45);
  var le7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2').filter(y).filter(d).filterBounds(aoi);
  if (!ALLOW_LE07_SLC_OFF) {
    le7 = le7.filterDate('1999-01-01','2003-05-31'); // keep only pre-SLC-off
  }
  le7 = le7.map(prepLE07);
  var lc8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filter(y).filter(d).filterBounds(aoi).map(prepLC089);
  var lc9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filter(y).filter(d).filterBounds(aoi).map(prepLC089);

  return lt4.merge(lt5).merge(le7).merge(lc8).merge(lc9);
}

//Median NDVI composite for ONE year; SAFE for empty collections
function seasonalNDVI_year(aoi, year, label){
  var coll = landsat30Year(aoi, year, DOY_START, DOY_END)
    .map(function(i){ return i.normalizedDifference(['nir','red']).rename('NDVI'); });

  var size = coll.size();

  //If empty: create zero-valued NDVI/count
  var count = ee.Image(ee.Algorithms.If(
    size.gt(0), coll.count().rename('count'),
    ee.Image.constant(0).rename('count')
  ));
  var ndviMedian = ee.Image(ee.Algorithms.If(
    size.gt(0), coll.median().rename('NDVI'),
    ee.Image.constant(0).rename('NDVI')
  ));

  var out = ndviMedian.updateMask(count.gte(MIN_OBS)).clip(aoi)
    .set({'year': year, 'n_scenes': size, 'label': label});

  //check information about each year
  print('Scenes used for', label, year, size);

  return out;
}

/************************** 1988, 2002, 2023 **************************/
var abb_1988 = seasonalNDVI_year(aoiAbbeyleix, 1988, 'Abbeyleix');
var abb_2002 = seasonalNDVI_year(aoiAbbeyleix, 2002, 'Abbeyleix');
var abb_2013 = seasonalNDVI_year(aoiAbbeyleix, 2013, 'Abbeyleix');
var abb_1995 = seasonalNDVI_year(aoiAbbeyleix, 1995, 'Abbeyleix');
var abb_2023 = seasonalNDVI_year(aoiAbbeyleix, 2023, 'Abbeyleix');

/************************** 1988, 2006, 2022 **************************/

var cla_1988 = seasonalNDVI_year(aoiClara, 1988, 'Clara');
var cla_1995 = seasonalNDVI_year(aoiClara, 1995, 'Clara');
var cla_2006 = seasonalNDVI_year(aoiClara, 2006, 'Clara');
var cla_2013 = seasonalNDVI_year(aoiClara, 2013, 'Clara');
var cla_2022 = seasonalNDVI_year(aoiClara, 2022, 'Clara');




/**************************** Visualization ****************************/
var ndviViz = {min:0.0, max:0.9, palette:['#4e342e','#9e9d24','#7cb342','#43a047','#1b5e20','#76ff03']};

Map.centerObject(aoiAbbeyleix, 13);
Map.addLayer(abb_1988, ndviViz, 'Abbeyleix NDVI 1988 (Jul–Aug)');
Map.addLayer(abb_2002, ndviViz, 'Abbeyleix NDVI 2002 (Jul–Aug)');
Map.addLayer(abb_2023, ndviViz, 'Abbeyleix NDVI 2023 (Jul–Aug)');

Map.addLayer(cla_1988, ndviViz, 'Clara NDVI 1988 (Jul–Aug)');
Map.addLayer(cla_2006, ndviViz, 'Clara NDVI 2006 (Jul–Aug)');
Map.addLayer(cla_2022, ndviViz, 'Clara NDVI 2022 (Jul–Aug)');

/******************************* Exports *******************************/
function exportNDVI(img, aoi, name){
  Export.image.toDrive({
    image: img, description: name,
    scale: 30,  region: aoi,
    crs: 'EPSG:2157', maxPixels: 1e13, skipEmptyTiles: true
  });
}
exportNDVI(abb_1988, aoiAbbeyleix, 'Abbeyleix_NDVI_1988_JulAug');
exportNDVI(abb_2002, aoiAbbeyleix, 'Abbeyleix_NDVI_2002_JulAug');
exportNDVI(abb_2023, aoiAbbeyleix, 'Abbeyleix_NDVI_2023_JulAug');


exportNDVI(cla_1988, aoiClara, 'Clara_NDVI_1988_JulAug');
exportNDVI(cla_2006, aoiClara, 'Clara_NDVI_2006_JulAug');
exportNDVI(cla_2022, aoiClara, 'Clara_NDVI_2022_JulAug'); 

/************ NDVI bin stats: area (ha) and % per site/year ************/
var SCALE = 30;
var MAXP  = 1e13;
// Peatland-oriented NDVI bins
var BINS = ee.List([-0.20, 0.10, 0.30, 0.45, 0.60, 0.75, 1.00]);
// labels: <0.10 water/shadows | 0.10–0.30 bare/cutover | 0.30–0.45 early recovery
// 0.45–0.60 Sphagnum/graminoid | 0.60–0.75 dense veg | ≥0.75 shrub/tree

var pa = ee.Image.pixelArea();

function areaHaFromMask(mask, aoi){
  var m2 = pa.updateMask(mask).unmask(0).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: aoi, scale: SCALE, maxPixels: MAXP
  }).get('area');
  return ee.Number(m2).divide(1e4); // m² -> ha
}

function ndviBinTable(ndvi, aoi){
  var site = ee.String(ndvi.get('label'));
  var year = ee.Number(ndvi.get('year'));
  var totalHa = areaHaFromMask(ndvi.mask(), aoi); // denominator = valid NDVI area

  var nEdges = BINS.length();
  var idxs = ee.List.sequence(0, nEdges.subtract(2)); // 0..(n-2)

  var feats = idxs.map(function(i){
    i   = ee.Number(i);
    var lo = ee.Number(BINS.get(i));
    var hi = ee.Number(BINS.get(i.add(1)));
    var isLast = i.eq(nEdges.subtract(2));

    // [lo, hi) for all but last; last is [lo, hi]
    var binMask = ee.Image(ee.Algorithms.If(
      isLast, ndvi.gte(lo).and(ndvi.lte(hi)),
      ndvi.gte(lo).and(ndvi.lt(hi))
    ));

    var ha  = areaHaFromMask(binMask, aoi);
    var pct = ha.divide(totalHa).multiply(100);

    var label = ee.String(ee.Algorithms.If(
      isLast, ee.String('>= ').cat(lo.format('%.2f')),
      lo.format('%.2f').cat(' - ').cat(hi.format('%.2f'))
    ));

    return ee.Feature(null, {
      site: site,
      year: year,
      bin_label: label,
      bin_lo: lo,
      bin_hi: hi,
      area_ha: ha,
      percent: pct
    });
  });

  return ee.FeatureCollection(feats);
}

// Building one table for all six images
var stats = ee.FeatureCollection([])
  .merge(ndviBinTable(abb_1988, aoiAbbeyleix))
  .merge(ndviBinTable(abb_1995, aoiAbbeyleix))
  .merge(ndviBinTable(abb_2002, aoiAbbeyleix))
  .merge(ndviBinTable(abb_2013, aoiAbbeyleix))
  .merge(ndviBinTable(abb_2023, aoiAbbeyleix))
  .merge(ndviBinTable(cla_1988, aoiClara))
  .merge(ndviBinTable(cla_1995, aoiClara))
  .merge(ndviBinTable(cla_2006, aoiClara))
  .merge(ndviBinTable(cla_2013, aoiClara))
  .merge(ndviBinTable(cla_2022, aoiClara));
 

print('NDVI bin stats (ha and %):', stats);

// Export CSV
Export.table.toDrive({
  collection: stats,
  description: 'NDVI_bin_areas_Abbeyleix_Clara',
  fileNamePrefix: 'NDVI_bin_areas_Abbeyleix_Clara',
  fileFormat: 'CSV'
});


/******************************* LEGEND *******************************/
var legend = ui.Panel({
  style: {position: 'bottom-left', padding: '8px', backgroundColor: 'rgba(255,255,255,0.9)'}
});

// Title
legend.add(ui.Label({
  value: 'NDVI (Jul–Aug)',
  style: {fontWeight: 'bold', fontSize: '12px', margin: '0 0 4px 0'}
}));

// Color bar 
var colorBar = ui.Thumbnail({
  image: ee.Image.pixelLonLat().select('longitude'),
  params: {
    region: ee.Geometry.Rectangle([0, 0, 1, 0.1]),
    dimensions: '240x12',
    min: ndviViz.min,
    max: ndviViz.max,
    palette: ndviViz.palette
  },
  style: {margin: '6px 0'}
});
legend.add(colorBar);

// Min / Mid / Max labels
var minVal = ndviViz.min;
var maxVal = ndviViz.max;
var midVal = (minVal + maxVal) / 2;

var labels = ui.Panel({
  widgets: [
    ui.Label(minVal.toFixed(2), {margin: '0 8px 0 0'}),
    ui.Label(midVal.toFixed(2), {margin: '0 8px 0 8px', textAlign: 'center', stretch: 'horizontal'}),
    ui.Label(maxVal.toFixed(2), {margin: '0 0 0 8px'})
  ],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});
legend.add(labels);

// Add to map
Map.add(legend);

//

