/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */

(function() {
  //= ========================================================
  // Load a custom script for the "about" page
  //= ========================================================
  $.extend(ReaderControl.config, {
    customScript: 'defaultScriptExtension.js'
  });

  var pageNum = 3;
  var searchString = 'WebViewer';
  var strLength = searchString.length;

  $(document).on('documentLoaded', function() {
    readerControl.setCurrentPageNumber(pageNum + 1);

    var doc = readerControl.docViewer.getDocument();

    // first get all of the text
    doc.loadPageText(pageNum, function(text) {
      var start = 0;
      var index;

      // search through the text for the indices that the search string starts at
      while ((index = text.indexOf(searchString, start)) !== -1) {
        // pass in the index of the text relative to all text on the page
        doc.getTextPosition(pageNum, index, index + strLength, highlightText);

        start = index + strLength;
      }
    });
  });

  function highlightText(quads) {
    var docViewer = readerControl.docViewer;
    var am = docViewer.getAnnotationManager();

    var firstChar = quads[0];
    var lastChar = quads[quads.length - 1];

    /* point locations
        x1 ---- x2
        |       |
        |       |
        x4 ---- x3
        */

    // center the selection coordinates to make it more precise
    var firstx = (firstChar.x1 + firstChar.x2) / 2;
    var finalx = (lastChar.x3 + lastChar.x4) / 2;
    var y = (firstChar.y1 + firstChar.y4) / 2;

    // assume that all the characters are aligned vertically
    // select from the top left of the first char to the bottom right of the last char
    var topLeft = { x: firstx, y: y, pageIndex: pageNum };
    var bottomRight = { x: finalx, y: y, pageIndex: pageNum };

    var annot = new Annotations.TextHighlightAnnotation();
    annot.setPageNumber(pageNum + 1);
    annot.StrokeColor = new Annotations.Color(0, 255, 255);
    am.addAnnotation(annot);

    var textHighlightTool = new window.Tools.TextHighlightCreateTool(docViewer);
    textHighlightTool.annotation = annot;
    textHighlightTool.pageCoordinates[0] = topLeft;
    textHighlightTool.select(topLeft, bottomRight);
  }
})();