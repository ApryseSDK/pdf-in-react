(function() {
  var mergeAndSave = function(doc, xfdf) {
    function* main() {
      // Import XFDF into FDF, then merge data from FDF into PDF
      // Annotations
      var fdf_doc = yield PDFNet.FDFDoc.createFromXFDF(xfdf);

      var pitr = yield doc.getPageIterator();
      for (; (yield pitr.hasNext()); pitr.next()) {
        try {
          var page = yield pitr.current();
          for (var i = (yield page.getNumAnnots()); i > 0;) {
            var annot_obj = yield page.getAnnot(--i);
            switch (yield annot_obj.getType()) {
              case PDFNet.Annot.Type.e_Widget:
              case PDFNet.Annot.Type.e_Link:
              case PDFNet.Annot.Type.e_Sound:
              case PDFNet.Annot.Type.e_Movie:
              case PDFNet.Annot.Type.e_FileAttachment:
                // these are not supported for import from webviewer
                break;
              default:
                page.annotRemoveByIndex(i);
                break;
            }
          }
        } catch (e) {
          console.log('Error Removing Annotations: ' + e);
          (yield page.getSDFObj()).erase('Annots');
        }
      }

      doc.fdfMerge(fdf_doc);

      // run any custom logic here
      doc.flattenAnnotations();

      var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
      return docbuf;
    }
    // start the generator
    return PDFNet.runGeneratorWithCleanup(main());
  };

  var customDownload = function(options) {
    var am = readerControl.docViewer.getAnnotationManager();
    var annotationsToRemove = am.getAnnotationsList();
    var current_document = this.docViewer.getDocument();
    return PDFNet.initialize().then(function() {
      return current_document.getPDFDoc();
    }).then(function(pdfDoc) {
      return mergeAndSave(pdfDoc, options.xfdfString);
    }).then(function(data) {
      // since we are flattening annotations we should remove the existing annotations in webviewer
      // and rerender so that the file displays correctly

      am.deleteAnnotations(annotationsToRemove);
      // clear the cache
      readerControl.docViewer.refreshAll();
      // update viewer with new document
      readerControl.docViewer.updateView();
      // Annotations may contain text so we need to regenerate
      // our text representation
      readerControl.docViewer.getDocument().refreshTextData();
      return data;
    });
  };

  // change the definition of getFileData to use our custom function
  // Note that this will make the original getFileData inaccessible
  $(document).on('viewerLoaded', function() {
    readerControl.getFileData = customDownload;
  });
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=config.js