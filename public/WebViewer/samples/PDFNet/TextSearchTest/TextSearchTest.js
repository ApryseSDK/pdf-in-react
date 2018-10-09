//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runTextSearchTest = function() {
    function* main() {
      console.log('Beginning Test');

      // Relative path to the folder containing test files.
      var input_url = '../TestFiles/';
      var input_filename = 'credit card numbers.pdf'; // addimage.pdf, newsletter.pdf

      try {
        var doc = yield PDFNet.PDFDoc.createFromURL(input_url + input_filename);
        doc.initSecurityHandler();
        doc.lock();

        var txt_search = yield PDFNet.TextSearch.create();
        var mode = PDFNet.TextSearch.Mode.e_whole_word + PDFNet.TextSearch.Mode.e_page_stop; // Uses both whole word and page stop
        var pattern = 'joHn sMiTh';

        txt_search.begin(doc, pattern, mode); // searches for the "pattern" in the document while following the inputted modes.

        var step = 0;

        // call Run() iteratively to find all matching instances of the word 'joHn sMiTh'
        while (true) {
          var result = yield txt_search.run();
          var hlts;
          if (result) {
            if (step === 0) { // Step 0: found "John Smith"
              // note that, here, 'ambient_str' and 'highlights' are not written to,
              // as 'e_ambient_string' and 'e_highlight' are not set.
              console.log(result.out_str + "'s credit card number is: ");

              // now switch to using regular expressions to find John's credit card number
              mode = yield txt_search.getMode();
              mode += PDFNet.TextSearch.Mode.e_reg_expression + PDFNet.TextSearch.Mode.e_highlight;
              txt_search.setMode(mode);
              pattern = '\\d{4}-\\d{4}-\\d{4}-\\d{4}'; // or "(\\d{4}-){3}\\d{4}"
              txt_search.setPattern(pattern);

              ++step;
            } else if (step === 1) {
              // step 1: found John's credit card number
              console.log(' ' + result.out_str);
              // note that, here, 'hlts' is written to, as 'e_highlight' has been set.
              // output the highlight info of the credit card number.
              hlts = result.highlights;
              hlts.begin(doc);
              while ((yield hlts.hasNext())) {
                var highlightPageNum = yield hlts.getCurrentPageNumber();
                console.log('The current highlight is from page: ' + highlightPageNum);
                yield hlts.next();
              }
              // see if there is an AMEX card number
              pattern = '\\d{4}-\\d{6}-\\d{5}';
              txt_search.setPattern(pattern);

              ++step;
            } else if (step === 2) {
              // found an AMEX card number
              console.log('There is an AMEX card number: ' + result.out_str);

              // change mode to find the owner of the credit card; supposedly, the owner's
              // name proceeds the number
              mode = yield txt_search.getMode();
              mode += PDFNet.TextSearch.Mode.e_search_up;
              txt_search.setMode(mode);
              pattern = '[A-z]++ [A-z]++';
              txt_search.setPattern(pattern);

              ++step;
            } else if (step === 3) {
              // found the owner's name of the AMEX card
              console.log("Is the owner's name: " + result.out_str + '?');

              // add a link annotation based on the location of the found instance
              hlts = result.highlights;
              yield hlts.begin(doc); // is yield needed?
              while ((yield hlts.hasNext())) {
                var cur_page = yield doc.getPage((yield hlts.getCurrentPageNumber()));
                var quad_arr = yield hlts.getCurrentQuads();
                for (var i = 0; i < quad_arr.length; ++i) {
                  var currQuad = quad_arr[i];
                  var x1 = Math.min(Math.min(Math.min(currQuad.p1x, currQuad.p2x), currQuad.p3x), currQuad.p4x);
                  var x2 = Math.max(Math.max(Math.max(currQuad.p1x, currQuad.p2x), currQuad.p3x), currQuad.p4x);
                  var y1 = Math.min(Math.min(Math.min(currQuad.p1y, currQuad.p2y), currQuad.p3y), currQuad.p4y);
                  var y2 = Math.max(Math.max(Math.max(currQuad.p1y, currQuad.p2y), currQuad.p3y), currQuad.p4y);

                  var hyper_link = yield PDFNet.LinkAnnot.create(doc, (yield PDFNet.Rect.init(x1, y1, x2, y2)));
                  yield hyper_link.setAction((yield PDFNet.Action.createURI(doc, 'http://www.pdftron.com')));
                  yield cur_page.annotPushBack(hyper_link);
                }
                hlts.next();
              }
              var docBuffer = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
              saveBufferAsPDFDoc(docBuffer, 'credit card numbers_linked.pdf');
              break;
            }
          } else if ((yield result.isPageEnd())) {
            // you can update your UI here, if needed
            console.log('page end');
          } else if ((result.isDocEnd())) {
            break;
          }
        }
      } catch (err) {
        console.log(err);
      }
    }
    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=TextSearchTest.js