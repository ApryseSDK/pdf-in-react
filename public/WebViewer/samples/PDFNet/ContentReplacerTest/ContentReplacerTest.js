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

  exports.runContentReplacer = function() {
    function* main() {
      try {
        console.log('Beginning Content Replacer Test');

        var input_url = '../TestFiles/';
        var input_filename = 'BusinessCardTemplate.pdf';
        var output_filename = 'BusinessCard.pdf';

        yield PDFNet.initialize();
        var doc = yield PDFNet.PDFDoc.createFromURL(input_url + input_filename);
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDFNet and PDF document initialized and locked');

        var replacer = yield PDFNet.ContentReplacer.create();
        var page = yield doc.getPage(1);
        var img = yield PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');

        var region = yield page.getMediaBox();
        var replace = yield img.getSDFObj();
        yield replacer.addImage(region, replace);
        yield replacer.addString('NAME', 'John Smith');
        yield replacer.addString('QUALIFICATIONS', 'Philosophy Doctor');
        yield replacer.addString('JOB_TITLE', 'Software Developer');
        yield replacer.addString('ADDRESS_LINE1', '#100 123 Software Rd');
        yield replacer.addString('ADDRESS_LINE2', 'Vancouver, BC');
        yield replacer.addString('PHONE_OFFICE', '604-730-8989');
        yield replacer.addString('PHONE_MOBILE', '604-765-4321');
        yield replacer.addString('EMAIL', 'info@pdftron.com');
        yield replacer.addString('WEBSITE_URL', 'http://www.pdftron.com');
        yield replacer.process(page);

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_remove_unused);
        saveBufferAsPDFDoc(docbuf, output_filename);

        console.log('Done. Result saved as ' + output_filename);
      } catch (err) {
        console.log(err);
      }
      try {
        console.log('Beginning Content Replacer Test');

        var input_url = '../TestFiles/';
        var input_filename = 'newsletter.pdf';
        var output_filename = 'newsletterReplaced.pdf';

        yield PDFNet.initialize();
        var doc = yield PDFNet.PDFDoc.createFromURL(input_url + input_filename);
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDFNet and PDF document initialized and locked');

        var replacer = yield PDFNet.ContentReplacer.create();
        var page = yield doc.getPage(1);
        var region = yield page.getMediaBox();
        yield replacer.addText(region, 'The quick onyx goblin jumps over the lazy dwarf');
        yield replacer.process(page);

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_remove_unused);
        saveBufferAsPDFDoc(docbuf, output_filename);

        console.log('Done. Result saved as ' + output_filename);
      } catch (err) {
        console.log(err);
      }
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=ContentReplacerTest.js
