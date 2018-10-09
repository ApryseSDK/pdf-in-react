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

  exports.runAddImageTest = function() {
    function* main() {
      try {
        console.log('Beginning Test');
        // Relative path to the folder containing test files.
        var input_url = '../TestFiles/';

        var doc = yield PDFNet.PDFDoc.create();
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDFNet and PDF document initialized and locked');

        var builder = yield PDFNet.ElementBuilder.create(); // ElementBuilder, used to build new element Objects
        // create a new page writer that allows us to add/change page elements
        var writer = yield PDFNet.ElementWriter.create(); // ElementWriter, used to write elements to the page
        // define new page dimensions
        var pageRect = yield PDFNet.Rect.init(0, 0, 612, 794);
        var page = yield doc.pageCreate(pageRect);

        writer.beginOnPage(page, PDFNet.ElementWriter.WriteMode.e_overlay);

        // Adding a JPEG image to output file
        var img = yield PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');
        var matrix = yield PDFNet.Matrix2D.create(200, 0, 0, 250, 50, 500);
        var matrix2 = yield PDFNet.Matrix2D.createZeroMatrix();
        yield matrix2.set(200, 0, 0, 250, 50, 500);
        var element = yield builder.createImageFromMatrix(img, matrix2);
        writer.writePlacedElement(element);

        // Add a PNG to output file
        img = yield PDFNet.Image.createFromURL(doc, input_url + 'butterfly.png');
        var matrix = yield PDFNet.Matrix2D.create((yield img.getImageWidth()), 0, 0, (yield img.getImageHeight()), 300, 500);
        element = yield builder.createImageFromMatrix(img, matrix);
        writer.writePlacedElement(element);

        // Add a GIF image to the output file
        img = yield PDFNet.Image.createFromURL(doc, input_url + 'pdfnet.gif');
        matrix = yield PDFNet.Matrix2D.create((yield img.getImageWidth()), 0, 0, (yield img.getImageHeight()), 50, 350);
        element = yield builder.createImageFromMatrix(img, matrix);
        writer.writePlacedElement(element);

        // Add a TIFF image to the output file
        img = yield PDFNet.Image.createFromURL(doc, input_url + 'grayscale.tif');
        matrix = yield PDFNet.Matrix2D.create((yield img.getImageWidth()), 0, 0, (yield img.getImageHeight()), 10, 50);
        element = yield builder.createImageFromMatrix(img, matrix);
        writer.writePlacedElement(element);
        writer.end();
        doc.pagePushBack(page);

        // Embed monochrome TIFF compressed using lossy JBIG2 filter
        page = yield doc.pageCreate(pageRect);
        writer.beginOnPage(page, 1, true, true);

        var hint_set = yield PDFNet.ObjSet.create();
        var enc = yield hint_set.createArray();
        yield enc.pushBackName('JBIG2');
        yield enc.pushBackName('Lossy');

        img = yield PDFNet.Image.createFromURL(doc, input_url + 'multipage.tif', enc);
        matrix = yield PDFNet.Matrix2D.create(612, 0, 0, 794, 0, 0);
        element = yield builder.createImageFromMatrix(img, matrix);
        writer.writePlacedElement(element);
        writer.end();
        doc.pagePushBack(page);

        // Add a JPEG200 to output file
        var page = yield doc.pageCreate(pageRect);
        writer.beginOnPage(page, 1, true, true);

        img = yield PDFNet.Image.createFromURL(doc, input_url + 'palm.jp2');
        matrix = yield PDFNet.Matrix2D.create((yield img.getImageWidth()), 0, 0, (yield img.getImageHeight()), 96, 80);
        element = yield builder.createImageFromMatrix(img, matrix);
        writer.writePlacedElement(element);

        // write 'JPEG2000 Sample' text under image
        var timesFont = yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman);
        writer.writeElement(yield builder.createTextBeginWithFont(timesFont, 32));
        element = yield builder.createTextRun('JPEG2000 Sample', timesFont, 32);
        matrix = yield PDFNet.Matrix2D.create(1, 0, 0, 1, 190, 30);
        element.setTextMatrix(matrix);// yield?
        writer.writeElement(element);
        var element2 = yield builder.createTextEnd();
        writer.writeElement(element2);

        writer.end();
        doc.pagePushBack(page); // add the page to the document

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'addimage.pdf');

        console.log('Done. Result saved as addimage.pdf');
      } catch (err) {
        console.log(err);
      }
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=AddImageTest.js