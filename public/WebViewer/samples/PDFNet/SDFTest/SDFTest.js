//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runSDFTest = function() {
    function* main() {
      console.log('Beginning SDF Test.');
      var input_url = '../TestFiles/';

      try {
        // Here we create a SDF/Cos document directly from PDF file. In case you have
        // PDFDoc you can always access SDF/Cos document using PDFDoc.GetSDFDoc() method.
        var docorig = yield PDFNet.PDFDoc.createFromURL(input_url + 'fish.pdf');
        var doc = yield docorig.getSDFDoc();
        doc.initSecurityHandler();
        doc.lock();
        console.log('Modifying into dictionary, adding custom properties, embedding a stream...');

        var trailer = yield doc.getTrailer(); // Get the trailer

        // Now we will change PDF document information properties using SDF API

        // Get the Info dictionary.

        var itr = yield trailer.find('Info');
        var info;
        if ((yield itr.hasNext())) {
          info = yield itr.value();
          // Modify 'Producer' entry.
          info.putString('Producer', 'PDFTron PDFNet');

          // read title entry if it is present
          itr = yield info.find('Author');
          if (yield (itr.hasNext())) {
            var itrval = yield itr.value();
            var oldstr = yield itrval.getAsPDFText();
            info.putText('Author', oldstr + ' - Modified');
          } else {
            info.putString('Author', 'Me, myself, and I');
          }
        } else {
          // Info dict is missing.
          info = yield trailer.putDict('Info');
          info.putString('Producer', 'PDFTron PDFNet');
          info.putString('Title', 'My document');
        }

        // Create a custom inline dictionary within Infor dictionary
        var custom_dict = yield info.putDict('My Direct Dict');
        custom_dict.putNumber('My Number', 100); // Add some key/value pairs
        custom_dict.putArray('My Array');

        // Create a custom indirect array within Info dictionary
        var custom_array = yield doc.createIndirectArray();
        info.put('My Indirect Array', custom_array); // Add some entries

        // create indirect link to root
        var trailerRoot = yield trailer.get('Root');
        custom_array.pushBack((yield trailerRoot.value()));

        // Embed a custom stream (file mystream.txt).
        var embed_file = yield PDFNet.Filter.createURLFilter(input_url + 'my_stream.txt');
        var mystm = yield PDFNet.FilterReader.create(embed_file);
        var indStream = yield doc.createIndirectStreamFromFilter(mystm);
        custom_array.pushBack(indStream);

        var docbuf = yield doc.saveMemory(0, '%PDF-1.4'); // PDFNet.SDFDoc.SaveOptions.e_remove_unused
        saveBufferAsPDFDoc(docbuf, 'sdftest_out.pdf');
        console.log('Done.');
      } catch (err) {
        console.log(err);
      }
    }
    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=SDFTest.js