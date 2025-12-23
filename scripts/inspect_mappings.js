const StationManager = require('../stationManager');
(async ()=>{
  const mgr = new StationManager();
  await mgr.load();
  const map = mgr.__proto__ ? mgr.polygonIndex : mgr.polygonIndex;
  console.log('stations', mgr.stations.length);
  const keys = Object.keys(mgr.polygonIndex || {});
  console.log('polygonIndex keys', keys.length);
  const mapping = mgr.polygonIndex; // polygonIndex used for lookup
  const sample = Object.keys(mapping).slice(0,20);
  console.log('sample polygons:', sample);
  // inspect mappingByPolygon - not exposed, so re-create by reading excel quickly like manager did
  const fs = require('fs');
})();