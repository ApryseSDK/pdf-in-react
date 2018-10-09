//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2014 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
(function(exports) {
  'use strict';

  exports.runPDFA = function() {
    function* main() {
      try {
        console.log('PDFA validation test begins.');

        var input_url = '../TestFiles/';
        var input_filename = 'newsletter.pdf';

        var convert = false;
        var pwd = '';
        var exceptions;
        var max_ref_objs = 10;
        var first_stop = false;
        var url = input_url + input_filename;

        var pdfa = yield PDFNet.PDFACompliance.createFromUrl(convert, url, pwd, PDFNet.PDFACompliance.Conformance.e_Level1B, exceptions, max_ref_objs, first_stop);

        var error_count = yield pdfa.getErrorCount();
        if (error_count === 0) {
          console.log(input_filename + ' is a valid PDFA.');
        } else {
          console.log(input_filename + ' is NOT a valid PDFA.');
          for (var i = 0; i < error_count; i++) {
            var error_code = yield pdfa.getError(i);
            var error_msg = yield PDFNet.PDFACompliance.getPDFAErrorMessage(error_code);
            var num_refs = yield pdfa.getRefObjCount(error_code);
            if (num_refs > 0) {
              var objs = [];
              for (var j = 0; j < num_refs; j++) {
                var obj_ref = yield pdfa.getRefObj(error_code, j);
                objs.push(obj_ref);
              }
              console.log('Error:' + error_msg + '. Objects:' + objs.toString());
            }
          }
        }
      } catch (err) {
        console.log(err);
      }
      try {
        console.log('PDFA conversion test begins.');

        var input_url = '../TestFiles/';
        var input_filename = 'fish.pdf';
        var output_filename = 'fish_pdfa.pdf';

        var convert = true;
        var pwd = '';
        var exceptions;
        var max_ref_objs = 10;
        var url_input = input_url + input_filename;

        console.log('Converting input document: ' + input_filename);
        var pdfa = yield PDFNet.PDFACompliance.createFromUrl(convert, url_input, pwd, PDFNet.PDFACompliance.Conformance.e_Level1B, exceptions, max_ref_objs);

        var error_count = yield pdfa.getErrorCount();
        if (error_count === 0) {
          console.log(input_filename + ' is a valid PDFA.');
        } else {
          console.log(input_filename + ' is NOT a valid PDFA.');
        }

        console.log('Save and validate the converted document: ' + output_filename);
        var linearize = true;
        var doc_buffer = yield pdfa.saveAsFromBuffer(linearize);
        saveBufferAsPDFDoc(doc_buffer, output_filename);
        var validate_only = false;
        var pdfa_validate = yield PDFNet.PDFACompliance.createFromBuffer(validate_only, doc_buffer, pwd, PDFNet.PDFACompliance.Conformance.e_Level1B, exceptions, max_ref_objs);
        var error_count_validate = yield pdfa_validate.getErrorCount();
        if (error_count_validate === 0) {
          console.log(output_filename + ' is a valid PDFA.');
        } else {
          console.log(output_filename + ' is NOT a valid PDFA.');
        }
      } catch (err) {
        console.log(err);
      }
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=PDFATest.js
