//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
(function(exports) {
  'use strict';

  exports.runPDFPageTest = function() {
    function* main() {
      console.log('Beginning Test');
      // eslint-disable-next-line no-unused-vars
      var ret = 0;
      var input_path = '../TestFiles/';

      // split a pdf into multiple separate pdf pages
      try {
        var in_doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'newsletter.pdf');
        in_doc.initSecurityHandler();
        in_doc.lock();

        console.log('PDF document initialized and locked');

        var page_count = yield in_doc.getPageCount();
        var pages_to_split = Math.min(4, page_count);

        // docStoreArray is used to leep track of the documents we have split up for later use.
        var docStoreArray = [];
        for (var i = 1; i <= pages_to_split; ++i) {
          var new_doc = yield PDFNet.PDFDoc.create();
          var filename = 'newsletter_split_page_' + i + '.pdf';
          new_doc.insertPages(0, in_doc, i, i, PDFNet.PDFDoc.InsertFlag.e_none);
          docStoreArray[i - 1] = new_doc;
          var docbuf = yield new_doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
          saveBufferAsPDFDoc(docbuf, filename);
          console.log('Result saved as ' + filename);
        }
      } catch (err) {
        // console.log(err);
        console.log(err.stack);
        ret = 1;
      }

      try {
        // start stack-based deallocation with startDeallocateStack. Later on when endDeallocateStack is called,
        // all objects in memory that were initialized since the most recent startDeallocateStack call will be
        // cleaned up. Doing this makes sure that memory growth does not get too high.
        yield PDFNet.startDeallocateStack();
        var new_doc = yield PDFNet.PDFDoc.create();
        new_doc.initSecurityHandler();
        new_doc.lock();

        console.log('Sample 2, merge several PDF documents into one:');
        var page_num = 15;

        for (var i = 1; i <= docStoreArray.length; ++i) {
          var currDoc = docStoreArray[i - 1];
          var currDocPageCount = yield currDoc.getPageCount();
          new_doc.insertPages(i, currDoc, 1, currDocPageCount, PDFNet.PDFDoc.InsertFlag.e_none);
        }
        var docbuf = yield new_doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'newsletter_merged.pdf');
        yield PDFNet.endDeallocateStack();
      } catch (err) {
        // console.log(err);
        console.log(err.stack);
        ret = 1;
      }

      try {
        yield PDFNet.startDeallocateStack();
        console.log('Sample 3, delete every second page');
        var in_doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'newsletter.pdf');

        in_doc.initSecurityHandler();
        in_doc.lock();

        var page_num = yield in_doc.getPageCount();

        while (page_num >= 1) {
          var itr = yield in_doc.getPageIterator(page_num);
          in_doc.pageRemove(itr);
          page_num -= 2;
        }

        var docbuf = yield in_doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'newsletter_page_removed.pdf');
        yield PDFNet.endDeallocateStack();
      } catch (err) {
        console.log(err);
        ret = 1;
      }

      try {
        yield PDFNet.startDeallocateStack();
        console.log('Sample 4, Insert a page at different locations');
        var in1_doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'newsletter.pdf');
        in1_doc.initSecurityHandler();
        in1_doc.lock();

        var in2_doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'fish.pdf');
        in2_doc.initSecurityHandler();
        in2_doc.lock();

        var src_page = yield in2_doc.getPageIterator(1);
        var dst_page = yield in1_doc.getPageIterator(1);
        var page_num = 1;
        while (yield dst_page.hasNext()) {
          if (page_num++ % 3 === 0) {
            in1_doc.pageInsert(dst_page, yield src_page.current());
          }
          dst_page.next();
        }

        var docbuf = yield in1_doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'newsletter_page_insert.pdf');
        console.log('done');
        yield PDFNet.endDeallocateStack();
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }

      try {
        yield PDFNet.startDeallocateStack();
        console.log('Sample 5, replicate pages within a single document');
        var doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'newsletter.pdf');
        doc.initSecurityHandler();

        // Replicate the cover page three times (copy page #1 and place it before the
        // seventh page in the document page sequence)
        var cover = yield doc.getPage(1);
        var p7 = yield doc.getPageIterator(7);
        doc.pageInsert(p7, cover);
        doc.pageInsert(p7, cover);
        doc.pageInsert(p7, cover);
        // replicate cover page two more times by placing it before and after existing pages
        doc.pagePushFront(cover);
        doc.pagePushBack(cover);

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'newsletter_page_clone.pdf');
        console.log('done saving newsletter_page_clone.pdf');
        yield PDFNet.endDeallocateStack();
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=PDFPageTest.js