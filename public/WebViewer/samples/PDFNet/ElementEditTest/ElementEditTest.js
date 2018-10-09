//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runElementEditTest = function() {
    function* ProcessElements(reader, writer, visited) {
      yield PDFNet.startDeallocateStack();
      var element;
      var colorspace = yield PDFNet.ColorSpace.createDeviceRGB();
      var redColor = yield PDFNet.ColorPt.init(1, 0, 0, 0);
      var blueColor = yield PDFNet.ColorPt.init(0, 0, 1, 0);

      for (var element = yield reader.next(); element !== null; element = yield reader.next()) {
        var elementType = yield element.getType();
        switch (elementType) {
          case PDFNet.Element.Type.e_image:
          case PDFNet.Element.Type.e_inline_image:
            // remove all images by skipping them
            break;
          case PDFNet.Element.Type.e_path:
            // Set all paths to red
            var gs = yield element.getGState();
            gs.setFillColorSpace(colorspace);
            gs.setFillColorWithColorPt(redColor);
            writer.writeElement(element);
            break;
          case PDFNet.Element.Type.e_text:
            // Set all text to blue
            var gs = yield element.getGState();
            gs.setFillColorSpace(colorspace);
            gs.setFillColorWithColorPt(blueColor);
            writer.writeElement(element);
            break;
          case PDFNet.Element.Type.e_form:
            writer.writeElement(element);
            var form_obj = yield element.getXObject();
            var form_obj_num = form_obj.getObjNum();
            // if XObject not yet processed
            if (visited.indexOf(form_obj_num) === -1) {
              // Set Replacement
              var insertedObj = yield form_obj.getObjNum();
              if (_.findWhere(visited, insertedObj) == null) {
                visited.push(insertedObj);
              }
              var new_writer = yield PDFNet.ElementWriter.create();
              reader.formBegin();
              new_writer.beginOnObj(form_obj, true);
              yield* ProcessElements(reader, new_writer, visited);
              new_writer.end();
              reader.end();
            }
            break;
          default:
            writer.writeElement(element);
        }
      }
      yield PDFNet.endDeallocateStack();
    }

    function* main() {
      console.log('Beginning Test');
      var ret = 0;
      // Relative path to the folder containing test files.
      var input_url = '../TestFiles/';
      var doc = yield PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
      doc.initSecurityHandler();
      doc.lock();

      console.log('PDF document initialized and locked');
      var writer = yield PDFNet.ElementWriter.create();
      var reader = yield PDFNet.ElementReader.create();
      var visited = [];

      var totalPageNumber = yield doc.getPageCount();

      var itr = yield doc.getPageIterator(1);

      // Read every page
      for (itr; yield itr.hasNext(); itr.next()) {
        var page = yield itr.current();
        var currentPageNumber = yield page.getIndex();
        console.log('Processing elements on page ' + currentPageNumber + '/' + totalPageNumber);
        var sdfObj = yield page.getSDFObj();
        // Set Replacement
        var insertedObj = yield sdfObj.getObjNum();
        if (_.findWhere(visited, insertedObj) == null) {
          visited.push(insertedObj);
        }
        reader.beginOnPage(page);
        writer.beginOnPage(page, PDFNet.ElementWriter.WriteMode.e_replacement, false);
        yield* ProcessElements(reader, writer, visited);
        writer.end();
        reader.end();
      }

      var docBuffer = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_remove_unused);
      saveBufferAsPDFDoc(docBuffer, 'newsletter_edited.pdf');
      console.log('Done.');
      return ret;
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=ElementEditTest.js