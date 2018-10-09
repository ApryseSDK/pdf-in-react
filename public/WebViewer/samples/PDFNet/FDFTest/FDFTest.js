//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';


  var createFDFFromXFDFURL = function(url) {
    return new Promise(function(resolve, reject) {
      var xhttp = new XMLHttpRequest();

      xhttp.onreadystatechange = function() {
        if (this.readyState === this.DONE) {
          if (xhttp.status === 200) {
            var data = xhttp.responseText;
            PDFNet.FDFDoc.createFromXFDF(data).then(function(fdfdoc) {
              resolve(fdfdoc);
            }, function(e) {
              reject(e);
            });
          } else {
            reject('Request for URL ' + url + ' received incorrect HTTP response code ' + xhttp.status);
          }
        }
      };
      xhttp.open('GET', url, true);
      xhttp.send();
    });
  };


  exports.runFDFTest = function() {
    function* main() {
      console.log('Beginning FDF Test.');
      var input_url = '../TestFiles/';

      // Import XFDF into FDF, then update adjust the PDF annotations to match the FDF
      try {
        // Annotations
        console.log('Import annotations from XFDF to FDF.');
        var fdf_doc = yield createFDFFromXFDFURL(input_url + 'form1_annots.xfdf');

        var doc = yield PDFNet.PDFDoc.createFromURL(input_url + 'form1.pdf');
        doc.initSecurityHandler();

        console.log('Update annotations from fdf');
        doc.fdfUpdate(fdf_doc);

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'form1_with_annots.pdf');
        console.log('Done sample');
      } catch (err) {
        console.log(err);
      }
    }
    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=FDFTest.js