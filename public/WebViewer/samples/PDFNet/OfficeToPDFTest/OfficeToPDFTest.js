//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2014 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  var convertOfficeToPDF = function(input_url, outputName, l) {
    return PDFNet.Convert.office2PDFBuffer(input_url, { l: l }).then(function(buffer) {
      saveBufferAsPDFDoc(buffer, outputName);
      console.log('Finished downloading ' + outputName);
    });
  };

  exports.runOfficeToPDF = function() {
    var input_dir = '../TestFiles/';
    var docx_filename = 'simple-word_2007.docx';
    var pptx_filename = 'simple-powerpoint_2007.pptx';
    var xlsx_filename = 'simple-excel_2007.xlsx';

    var l = window.sampleL; // replace with your own license key and remove the samples-key.js script tag;
    PDFNet.initialize(l).then(function() {
      return convertOfficeToPDF(input_dir + docx_filename, 'converted_docx.pdf', l);
    }).then(function() {
      return convertOfficeToPDF(input_dir + pptx_filename, 'converted_pptx.pdf', l);
    }).then(function() {
      return convertOfficeToPDF(input_dir + xlsx_filename, 'converted_xlsx.pdf', l);
    })
      .then(function() {
        console.log('Test Complete!');
      })
      .catch(function() {
        console.log('An error was encountered! :(');
      });
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=OfficeToPDFTest.js
