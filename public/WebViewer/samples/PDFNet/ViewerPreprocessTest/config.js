(function() {
  $(document).on('viewerLoaded', function() {
    readerControl.showProgress();
    readerControl.$progressBar.find('.progress-text').text('Initializing Backend...');
    PDFNet.initialize().then(function() {
      readerControl.$progressBar.find('.progress-text').text('Preprocessing Document...');
      return runScript();
    }).then(function(doc) {
      readerControl.loadAsync(null, doc);
      console.log('finished script');
    });
  });

  function runScript() {
    function* ModAnnotations(doc) {
      var imagefile = '../../samples/PDFNet/TestFiles/grayscale.tif';

      yield PDFNet.startDeallocateStack(); // start stack-based deallocation. All objects will be deallocated by end of function
      // The following code snippet traverses all annotations in the document
      console.log('Traversing all annotations in the document...');

      var apWriter = yield PDFNet.ElementWriter.create();
      var apBuilder = yield PDFNet.ElementBuilder.create();

      var sigImg = yield PDFNet.Image.createFromURL(doc, imagefile);

      var itr = yield doc.getPageIterator(1);
      for (itr; (yield itr.hasNext()); (yield itr.next())) {
        var page = yield itr.current();
        var num_annots = yield page.getNumAnnots();
        var num_mod = 0;
        for (var i = 0; i < num_annots; ++i) {
          var annot = yield page.getAnnot(i);
          if (!(yield annot.isValid())) {
            continue;
          }

          var annotType = yield annot.getType();
          switch (annotType) {
            case PDFNet.Annot.Type.e_Stamp:
            {
              apWriter.begin(doc);
              var w = yield sigImg.getImageWidth();
              var h = yield sigImg.getImageHeight();
              var apElement = yield apBuilder.createImageScaled(sigImg, 0, 0, w, h);
              apWriter.writePlacedElement(apElement);
              var apObj = yield apWriter.end();
              apObj.putRect('BBox', 0, 0, w, h);
              apObj.putName('Subtype', 'Form');
              apObj.putName('Type', 'XObject');
              apElement = yield apBuilder.createFormFromStream(apObj);
              apWriter.writePlacedElement(apElement);
              apObj = yield apWriter.end();
              apObj.putRect('BBox', 0, 0, w, h);
              apObj.putName('Subtype', 'Form');
              apObj.putName('Type', 'XObject');
              yield annot.setAppearance(apObj);
              num_mod += 1;
              break;
            }
            default:
              break;
          }
        }
      }

      console.log('number of annotation modifications: ' + num_mod);

      yield PDFNet.endDeallocateStack();
    }

    function* main() {
      try {
        // todo load a document from url
        var input_url = '../../samples/PDFNet/TestFiles/';
        var input_filename = 'fish_stamped.pdf';
        var url = input_url + input_filename;
        console.log('loading document from url: ' + url);
        var doc = yield PDFNet.PDFDoc.createFromURL(url);
        doc.initSecurityHandler();
        doc.lock();
        console.log('loaded document from url: ' + url);
        // modify annotations
        yield* ModAnnotations(doc);
        // flatten annotations
        doc.flattenAnnotations();
        console.log('flattened document from url: ' + url);
        return doc;
      } catch (err) {
        console.log(err.stack);
      } finally {
        if (doc) {
          doc.unlock();
        }
      }
    }
    // start the generator, without cleanup so the document still valid when generator finishes running
    return PDFNet.runGeneratorWithoutCleanup(main());
  }
})();
// eslint-disable-next-line spaced-comment
//# sourceURL=config.js