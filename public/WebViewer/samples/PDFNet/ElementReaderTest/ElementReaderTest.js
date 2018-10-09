//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2014 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runElementReaderTest = function() {
    function* ProcessElements(reader) {
      // Read page contents
      for (var element = yield reader.next(); element !== null; element = yield reader.next()) {
        var temp = yield element.getType();
        switch (temp) {
          case exports.PDFNet.Element.Type.e_path: // Process path data...
            {
              var data = yield element.getPathData();
              /* eslint-disable no-unused-vars */
              var operators = data.operators;
              var points = data.points;
              /* eslint-enable no-unused-vars */
            }
            break;
          case exports.PDFNet.Element.Type.e_text: // Process text strings...
            {
              var data = yield element.getTextString();
              console.log(data);
            }
            break;
          case exports.PDFNet.Element.Type.e_form: // Process form XObjects
            {
              reader.formBegin();
              yield* ProcessElements(reader);
              reader.end();
            }
            break;
          default:
        }
      }
    }

    function* main() {
      console.log('Beginning Test');
      var ret = 0;

      // Relative path to the folder containing test files.
      var input_url = '../TestFiles/';

      var doc = yield exports.PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');// yield if there is ret that we care about.
      doc.initSecurityHandler();
      doc.lock();
      console.log('PDFNet and PDF document initialized and locked');

      // eslint-disable-next-line no-unused-vars
      var pgnum = yield doc.getPageCount();
      var page_reader = yield exports.PDFNet.ElementReader.create();
      var itr = yield doc.getPageIterator(1);

      // Read every page
      for (itr; yield itr.hasNext(); itr.next()) {
        var curritr = yield itr.current();
        page_reader.beginOnPage(curritr);
        yield* ProcessElements(page_reader);
        page_reader.end();
      }

      console.log('Done.');
      return ret;
    }

    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=ElementReaderTest.js