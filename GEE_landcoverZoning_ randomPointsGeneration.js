var DNCC_boundary = ee.FeatureCollection("users/sahadeb/DNCC_dissolved");

//Centering map to ROI
Map.centerObject(DNCC_boundary,12)

//Import ESRI 10m Annual Land Use Land Cover
var esri_lulc10 = ee.ImageCollection("projects/sat-io/open-datasets/landcover/ESRI_Global-LULC_10m_TS");


// Dictionary to visualize legends on map
var dict = {
  "names": [
    "Water",
    "Trees",
    "Flooded Vegetation",
    "Crops",
    "Built Area",
    "Bare Ground",
    "Snow/Ice",
    "Clouds",
    "Rangeland"
  ],
  "colors": [
    "#1A5BAB",
    "#358221",
    "#87D19E",
    "#FFDB5C",
    "#ED022A",
    "#EDE9E4",
    "#F2FAFF",
    "#C8C8C8",
    "#C6AD8D"
  ]};
  
  // Reclassification as per the requirement
  function remapper(image){
    var remapped = image.remap([1,2,4,5,7,8,9,10,11],[1,2,3,4,5,6,7,8,9])
    return remapped
  }

// Assigning color palette
var palette = [
    "#1A5BAB",
    "#358221",
    "#000000",
    "#87D19E",
    "#FFDB5C",
    "#000000",
    "#ED022A",
    "#EDE9E4",
    "#F2FAFF",
    "#C8C8C8",
    "#C6AD8D",
  ];

// Create a panel to hold the legend widget
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

// Function to generate the legend
function addCategoricalLegend(panel, dict, title) {
  
  // Create and add the legend title.
  var legendTitle = ui.Label({
    value: title,
    style: {
      fontWeight: 'bold',
      fontSize: '18px',
      margin: '0 0 4px 0',
      padding: '0'
    }
  });
  panel.add(legendTitle);
  
  var loading = ui.Label('Loading legend...', {margin: '2px 0 4px 0'});
  panel.add(loading);
  
  // Creates and styles 1 row of the legend
  var makeRow = function(color, name) {
    // Create the label with associated colored box
    var colorBox = ui.Label({
      style: {
        backgroundColor: color,
        // Use padding to give the box height and width.
        padding: '8px',
        margin: '0 0 4px 0'
      }
    });
  
    // Labeling the class name
    var description = ui.Label({
      value: name,
      style: {margin: '0 0 4px 6px'}
    });
  
    return ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
  };
  
  // Generating the list of palette colors with associated class names
  var palette = dict['colors'];
  var names = dict['names'];
  loading.style().set('shown', false);
  
  for (var i = 0; i < names.length; i++) {
    panel.add(makeRow(palette[i], names[i]));
  }
  
  Map.add(panel);
  
}

/*
Display map and legend 
*/

// Add the legend to the map
addCategoricalLegend(legend, dict, '10m Global Land Cover: Impact Observatory');

/*
class wise Area calculaiton 
*/

//filtering image of 2021
var lulc2021 = ee.ImageCollection(esri_lulc10.filterDate('2021-01-01','2021-12-31').mosaic()).map(remapper).mean()
print(lulc2021.clip(DNCC_boundary).select("remapped"),"LULC 2021 image")
var lulcImg = lulc2021.clip(DNCC_boundary).select("remapped")

//Class wise pixel selection
var othersImg = lulcImg.eq(1).or(lulcImg.eq(3)).or(lulcImg.eq(4)).or(lulcImg.eq(6)).or(lulcImg.eq(7)).or(lulcImg.eq(8)).or(lulcImg.eq(9))
var treeImg = lulcImg.eq(2)
var builtupImg = lulcImg.eq(5)


 //function for calculating area for each class
 var classArea = function(classImg, className){
   var areaImage = classImg.multiply(ee.Image.pixelArea())
  var area = areaImage.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: DNCC_boundary,
  scale: 10,
  maxPixels: 1e10
  })
var classAreaInSqKm = ee.Number(
  area.get('remapped')).divide(1e6).format('%.2f')
print("total",className,"area is", classAreaInSqKm , "sq KM")
return classAreaInSqKm
 }
 
 //calling classArea function to calculate area
classArea(treeImg,"Tree")
classArea(builtupImg,"Builtup")
classArea(othersImg,"Other class")

/*
raster to vector coversion of each class to generate random points within each class boundary
defining a method to convert each class from raster to vector so that can be used to generate random points within each class
*/

//function to convert raster to vector
var classRasterToVector = function(classImg,className,vizColor){
  var classRaster = classImg.updateMask(classImg.neq(0)) 
  var classVector = classRaster.reduceToVectors({
  geometry:DNCC_boundary,
  scale:10,
  crs: classRaster.projection(), 
  reducer: ee.Reducer.countEvery()
  })
Map.addLayer(classVector,{color:vizColor},className+" class vector")
return classVector
}

//calling the raster to vector function
var tree_shp= classRasterToVector(treeImg,"Tree","green")
var builtUp_shp = classRasterToVector(builtupImg,"builtUp","red")
var others_shp= classRasterToVector(othersImg,"other ","cyan")

/*
random point generation 
*/

//funciton to generate random points inside the boundary of each class 
var genRandPoint = function(classShp,pointNumber, className){
  var ranPoint = ee.FeatureCollection.randomPoints({
    region:classShp,
    points:pointNumber
  })

// Create a function to extract the latitude, longitude, and plot number
var extractLatLng = function(feature) {
  var geometry = feature.geometry();
  var coordinates = geometry.coordinates();
  var latitude = ee.Number(coordinates.get(1));
  var longitude = ee.Number(coordinates.get(0));
  var serial = ee.Number.parse(feature.get("system:index"));
  var serialNo = ee.String(className+"_").cat(ee.String(serial.add(1)));
  return feature.set('latitude', latitude).set('longitude', longitude).set("PointNo", serialNo);
};

// Looping the extractLatLng function over the shapefile
var latLngCollection = ranPoint.map(extractLatLng);

// Create a feature collection with only latitude and longitude properties
var latLngOnly = latLngCollection.select(["PointNo",'latitude', 'longitude']);
print( "random points for ",className,"class",latLngOnly)

// Export the feature collection to a CSV file
Export.table.toDrive({
  collection: latLngOnly,
  description: className+ '_class_randompoints_latlng_export',
  fileNamePrefix: "random point of "+ className +" class",
  fileFormat: 'CSV',
  selectors:['latitude', 'longitude',"PointNo"]
});
}

//calling the genRandPoint function to generate random points within the shape file of each class
genRandPoint(tree_shp,280,"tree")
genRandPoint(others_shp,90,"others")
genRandPoint(builtUp_shp,90,"builtup")


Map.addLayer(lulc2021.clip(DNCC_boundary), {min:1, max:9, palette:dict['colors']}, '2021 LULC 10m')