//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runWebViewerConvertTest = function() {
    function* main() {
      console.log('Beginning Test');
      var ret = 0;
      var input_path = '../TestFiles/';
      try {
        var doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'tiger.pdf');
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDFNet and PDF document initialized and locked');

        var XodBuffer = yield doc.convertToXod();

        saveBufferAsXOD(XodBuffer, 'from_pdf.xod');

        // have example of streaming

        var XodFilter = yield doc.convertToXodStream();
        var XodFilterReader = yield PDFNet.FilterReader.create(XodFilter);
        var dataArray = []; // used to store all the data of the .xod file
        var chunkLength = 1024; // size of every chunk stored in
        var retrievedLength = chunkLength; // amount of data to place in dataArray at a time
        while (chunkLength === retrievedLength) {
          var bufferSubArray = yield XodFilterReader.read(chunkLength);
          retrievedLength = bufferSubArray.length;
          dataArray.push(bufferSubArray);
        }
        var bufferFinal = new Uint8Array(dataArray.length * chunkLength + retrievedLength);
        for (var i = 0; i < dataArray.length; i++) {
          var offset = i * chunkLength;
          var currentArr = dataArray[i];
          bufferFinal.set(currentArr, offset);
        }
        saveBufferAsXOD(bufferFinal, 'from_pdf_streamed.xod');
        console.log('done.');
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }
      return ret;
    }

    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=WebViewerConvertTest.js