const StationManager = require('../stationManager');
(async ()=>{
  try{
    const sm = new StationManager();
    const count = await sm.load();
    console.log('Loaded station count:', count);
    console.log('Unique polygons:', Object.keys(sm.polygonIndex).length);
    console.log('Sample station:', sm.stations.slice(0,5));
  }catch(e){
    console.error('ERR', e.message);
    process.exit(1);
  }
})();
