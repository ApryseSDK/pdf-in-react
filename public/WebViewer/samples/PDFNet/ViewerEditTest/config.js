(function() {
  $('.right-aligned').append('<span id="runEditTest" class="glyphicons refresh" data-i18n="[title]controlbar.download"></span>');
  // need to increase min width of control bar to prevent bar from being pushed down.
  $('#control').css('min-width', 720);
  var editButton = $('#runEditTest');
  editButton.addClass('ui-state-disabled'); // initially disabled

  $(document).on('documentLoaded', function() {
    PDFNet.initialize().then(function() {
      var doc = readerControl.docViewer.getDocument();
      doc.getPDFDoc().then(function(pdfDoc) {
        // remove any past instances once a new document is loaded
        editButton.removeClass('ui-state-disabled');
        editButton.off('click');

        editButton.click(function() {
          if (!editButton.hasClass('ui-state-disabled')) {
            editButton.addClass('ui-state-disabled');

            runElementEditTest(pdfDoc).then(function() {
              // re-enable our button
              editButton.removeClass('ui-state-disabled');
              // refresh the cache with the newly updated document
              readerControl.docViewer.refreshAll();
              // update viewer with new document
              readerControl.docViewer.updateView();
            });
          }
        });
      });
    });
  });

  var runElementEditTest = function(pdfDoc) {
    function* ProcessElements(reader, writer, visited) {
      yield PDFNet.startDeallocateStack();
      console.log('Processing elements');
      var element;
      var gs;
      var colorspace = yield PDFNet.ColorSpace.createDeviceRGB();
      var redColor = yield PDFNet.ColorPt.init(1, 0, 0, 0);
      var blueColor = yield PDFNet.ColorPt.init(0, 0, 1, 0);
      for (element = yield reader.next(); element !== null; element = yield reader.next()) {
        var elementType = yield element.getType();
        switch (elementType) {
          case PDFNet.Element.Type.e_image:
          case PDFNet.Element.Type.e_inline_image:
            // remove all images by skipping them
            break;
          case PDFNet.Element.Type.e_path:
            // Set all paths to red
            gs = yield element.getGState();
            gs.setFillColorSpace(colorspace);
            gs.setFillColorWithColorPt(redColor);
            // Note: since writeElement does not return an object, the yield is technically unneeded.
            // However, on a slower computer or browser writeElement may not finish before the page is
            // updated, so the yield ensures that all changes are finished before continuing.
            yield writer.writeElement(element);
            break;
          case PDFNet.Element.Type.e_text:
            // Set all text to blue
            gs = yield element.getGState();
            gs.setFillColorSpace(colorspace);
            gs.setFillColorWithColorPt(blueColor);
            // Same as above comment on writeElement
            yield writer.writeElement(element);
            break;
          case PDFNet.Element.Type.e_form:
            yield writer.writeElement(element);
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
              if (new_writer) {
                new_writer.destroy();
              }
            }
            break;
          default:
            yield writer.writeElement(element);
        }
      }
      yield PDFNet.endDeallocateStack();
    }

    function* main() {
      var ret = 0;
      try {
        // eslint-disable-next-line no-unused-vars
        var islocked = false;
        var doc = pdfDoc;
        doc.lock();
        islocked = true;
        doc.initSecurityHandler();

        var writer = yield PDFNet.ElementWriter.create();
        var reader = yield PDFNet.ElementReader.create();
        var visited = [];

        var pageCount = yield doc.getPageCount();

        var pageCounter = 1;
        while (pageCounter <= pageCount) {
          // This section is only required to ensure the page is available
          // for incremental download. At the moment the call to requirePage must be
          // be wrapped in this manner to avoid potential deadlocks and
          // allow other parts of the viewer to run while the page is being downloaded.
          doc.unlock();
          yield PDFNet.finishOperation();
          yield doc.requirePage(pageCounter);
          yield PDFNet.beginOperation();
          doc.lock();

          // load the page and begin processing
          var page = yield doc.getPage(pageCounter);
          var sdfObj = yield page.getSDFObj();
          var insertedObj = yield sdfObj.getObjNum();
          if (_.findWhere(visited, insertedObj) == null) {
            visited.push(insertedObj);
          }
          reader.beginOnPage(page);
          writer.beginOnPage(page, PDFNet.ElementWriter.WriteMode.e_replacement, false);
          yield* ProcessElements(reader, writer, visited);
          writer.end();
          reader.end();
          console.log('page ' + pageCounter + ' finished editing');
          pageCounter++;
        }
        console.log('Done.');
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }
      return ret;
    }

    return PDFNet.runGeneratorWithCleanup(main());
  };
})();
// eslint-disable-next-line spaced-comment
//# sourceURL=config.js