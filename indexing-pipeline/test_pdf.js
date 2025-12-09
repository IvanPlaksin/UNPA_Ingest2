const pdf = require('pdf-parse');
console.log('Keys:', Object.keys(pdf));
if (pdf.default) {
    console.log('Has default export:', typeof pdf.default);
}
console.log('Full object:', pdf);
