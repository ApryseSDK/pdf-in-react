(function(exports) {
  'use strict';

  function* initAll(docurl) {
    try {
      // yield exports.PDFNet.initialize(); // yields promise
      // PDFNet.beginOperation();
      var doc = yield exports.PDFNet.PDFDoc.createFromURL(docurl);
      doc.initSecurityHandler();
      doc.lock();
      var pagecount = yield doc.getPageCount();
      var pdfdraw = yield exports.PDFNet.PDFDraw.create(100);
      return { doc: doc, pdfdraw: pdfdraw, pagecount: pagecount };
    } catch (err) {
      console.log(err.stack);
    }
  }

  function* renderPage(renderData, pageIndex) {
    try {
      var doc = renderData.doc;
      var pdfdraw = renderData.pdfdraw;

      var currentPage = yield doc.getPage(pageIndex);
      var bitmapInfo = yield pdfdraw.getBitmap(currentPage, exports.PDFNet.PDFDraw.PixelFormat.e_rgba, false);
      var bitmapWidth = bitmapInfo.width;
      var bitmapHeight = bitmapInfo.height;
      var bitmapArray = new Uint8ClampedArray(bitmapInfo.buf);

      var drawingCanvas = document.createElement('canvas');
      drawingCanvas.width = bitmapWidth;
      drawingCanvas.height = bitmapHeight;

      var ctx = drawingCanvas.getContext('2d');
      var imgData = ctx.createImageData(bitmapWidth, bitmapHeight);
      imgData.data.set(bitmapArray);

      ctx.putImageData(imgData, 0, 0);
      return drawingCanvas;
    } catch (err) {
      console.log(err.stack);
    }
  }

  exports.loadDocument = function(docurl) {
    return PDFNet.runGeneratorWithoutCleanup(initAll(docurl), window.parent.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };

  exports.loadCanvasAsync = function(renderData, pageIndex) {
    return PDFNet.runGeneratorWithoutCleanup(renderPage(renderData, pageIndex));
  };
})(window);
// # sourceURL=DeckJSTest.js