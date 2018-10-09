//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2014 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2014 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runPDFDrawTest = function() {
    function* main() {
      console.log('Beginning Test');
      var ret = 0;
      var input_url = '../TestFiles/';
      var doc = yield exports.PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
      doc.initSecurityHandler();
      doc.lock();

      console.log('PDFNet and PDF document initialized and locked');

      var pdfdraw = yield exports.PDFNet.PDFDraw.create(92);
      var itr = yield doc.getPageIterator(1);
      var currPage = yield itr.current();
      var pngBuffer = yield pdfdraw.exportStream(currPage, 'PNG');
      saveBufferAsPNG(pngBuffer, 'newsletter.png');
      var tifBuffer = yield pdfdraw.exportStream(currPage, 'TIFF');
      saveBufferAsPNG(tifBuffer, 'newsletter.tif');

      console.log('Done');
      return ret;
    }

    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=PDFDrawTest.js