/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */
(function() {
  'use strict';

  // Create a custom tool for redaction
  var CustomRedactionCreateTool = function(docViewer) {
    // pass in the constructor to the custom Annotation
    Tools.GenericAnnotationCreateTool.call(this, docViewer, Annotations.RectangleAnnotation);
  };
  CustomRedactionCreateTool.prototype = new Tools.GenericAnnotationCreateTool();
  CustomRedactionCreateTool.prototype.mouseLeftUp = function(e) {
    var annot = this.annotation;
    Tools.GenericAnnotationCreateTool.prototype.mouseLeftUp.call(this, e);
    if (annot) {
      // if an annot is created...
      var am = readerControl.docViewer.getAnnotationManager();
      var docCore = readerControl.docViewer.getDocument();
      var pdfDoc;

      // When any outstanding operation have completed, begin redacting
      PDFNet.initialize().then(function() {
        docCore.getPDFDoc().then(function(viewedDoc) {
          pdfDoc = viewedDoc;
          // waits for page to be downloaded before continuing
          return pdfDoc.requirePage(annot.getPageNumber());
        }).then(function() {
          return redactElementsInBox(pdfDoc, docCore, annot, am);
        }).then(function() {
          // remove our selection box
          am.deleteAnnotation(annot);
          // refresh the page with the newly updated document
          readerControl.docViewer.refreshPage(annot.getPageNumber());

          // update viewer with new document
          readerControl.docViewer.updateView();
          readerControl.docViewer.getDocument().refreshTextData();
        });
      });
    }
  };

  $(document).on('documentLoaded', function() {
    $('#overflowToolsContainer').prepend('<span data-toolmode="AnnotationCreateRedactionTool" class="annotTool glyphicons" title="Redaction"><img src="../../samples/PDFNet/ViewerRedactTest/annot_custom_redact.png"/></span>');
    var redactTool = 'AnnotationCreateRedactionTool';
    readerControl.toolModeMap[redactTool] = new CustomRedactionCreateTool(readerControl.docViewer);
    readerControl.setToolMode(redactTool);
  });

  var redactElementsInBox = function(pdfDoc, docCore, annot, annotManager) {
    // Convert an iterator of sequentially dependent promises (that take each result in the sequence as the next one's parameter) into a single promise
    function* main() {
      /* eslint-disable no-unused-vars */
      var ret = 0;
      try {
        var islocked = false;
        var pageNumber = annot.getPageNumber();
        var doc = pdfDoc;
        doc.initSecurityHandler();
        doc.lock();

        islocked = true;

        var redactRectX1 = annot.getX();
        var redactRectY1 = annot.getY();
        var redactRectX2 = redactRectX1 + annot.getWidth();
        var redactRectY2 = redactRectY1 + annot.getHeight();
        // Redact all annotations that come in contact with the redaction box.
        var listOfAnnots = annotManager.getAnnotationsList();
        for (var i = listOfAnnots.length - 1; i >= 0; i--) {
          var currAnnot = listOfAnnots[i];
          var currAnnotPage = currAnnot.PageNumber;
          if (pageNumber !== currAnnotPage) {
            continue;
          } // discontinue if not on same page
          var currAnnotX1 = currAnnot.X;
          var currAnnotX2 = currAnnot.X + currAnnot.Width;
          if (redactRectX1 > currAnnotX2 || redactRectX2 < currAnnotX1) {
            continue;
          } // discontinue if not on same horizontal level
          var currAnnotY1 = currAnnot.Y;
          var currAnnotY2 = currAnnot.Y + currAnnot.Height;
          if (redactRectY1 > currAnnotY2 || redactRectY2 < currAnnotY1) {
            continue;
          } // discontinue if not on same horizontal level
          annotManager.deleteAnnotation(currAnnot);
        }
        // Turn element coordinates into PDF coordinates
        var pdfCoord = docCore.getPDFCoordinates(pageNumber - 1, redactRectX1, redactRectY1);
        var pdfCoord2 = docCore.getPDFCoordinates(pageNumber - 1, redactRectX2, redactRectY2);

        var redactionArray = [];
        // Create our redaction object
        redactionArray.push(yield PDFNet.Redactor.redactionCreate(pageNumber, (yield PDFNet.Rect.init(pdfCoord.x, pdfCoord.y, pdfCoord2.x, pdfCoord2.y)), false, ''));
        var appear = {};
        yield PDFNet.Redactor.redact(doc, redactionArray, appear, false, false);

        console.log('Redacted Area (x1: ' + pdfCoord.x + ', y1: ' + pdfCoord.y + ', x2: ' + pdfCoord2.x + ', y2: ' + pdfCoord2.y + ') redacted');
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }
    }
    return PDFNet.runGeneratorWithCleanup(main());
  };
})();
// eslint-disable-next-line spaced-comment
//# sourceURL=config.js