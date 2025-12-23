const ExcelJS = require('exceljs');
const path = require('path');
(async ()=>{
  const fp = path.join(__dirname,'..','עותק של רשימת תחנות - אזורי פקע\'\'ר - מעודכן.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fp);
  const sheet = wb.getWorksheet('רשימת תחנות') || wb.getWorksheet('D.B') || wb.getWorksheet(2);
  if(!sheet) { console.log('no sheet found'); return; }
  const header = sheet.getRow(1);
  const headers = [];
  for(let c=1;c<=header.cellCount;c++){ headers.push((header.getCell(c).value||'').toString()); }
  console.log('headers:', headers.slice(0,20));
  for(let r=2;r<=Math.min(10,sheet.rowCount);r++){
    const row = sheet.getRow(r);
    const vals = [];
    for(let c=1;c<=Math.min(10,header.cellCount);c++){ vals.push((row.getCell(c).value||'').toString()); }
    console.log('row',r, vals);
  }
})();