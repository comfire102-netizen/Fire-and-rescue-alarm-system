const ExcelJS = require('exceljs');
const path = require('path');
(async ()=>{
  try{
    const file = path.join(__dirname, '..', "עותק של רשימת תחנות - אזורי פקע''ר - מעודכן.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const sheet = wb.getWorksheet('D.B') || wb.getWorksheet(2) || wb.worksheets[0];
    console.log('Worksheet:', sheet.name, 'rows:', sheet.rowCount);
    for(let i=1;i<=10 && i<=sheet.rowCount;i++){
      const row = sheet.getRow(i);
      console.log(i, row.values.slice(1));
    }
  }catch(e){
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
