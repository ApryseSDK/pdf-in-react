//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runRectTest = function() {
    function* main() {
      var ret = 0;
      try {
        console.log('Beginning Rect Test. This test will take the rect box of an image and move/translate it');

        var input_path = '../TestFiles/';
        var doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'tiger.pdf');
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDF document initialized and locked');

        var pg_itr1 = yield doc.getPageIterator();
        var media_box = yield (yield pg_itr1.current()).getMediaBox();
        media_box.x1 -= 200; // translate page 200 units left(1 uint = 1/72 inch)
        media_box.x2 -= 200;

        yield media_box.update();

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'tiger_shift.pdf');
        console.log('Done.');
      } catch (err) {
        console.log(err);
        ret = 1;
      }
      return ret;
    }
    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=AnnotationTest.js