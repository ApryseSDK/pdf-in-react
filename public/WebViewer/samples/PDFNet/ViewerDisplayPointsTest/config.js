(function() {
  // Stores information of the elements of each page so that we don't have to recompute them on subsequent clicks
  var pageElementDataList = [];

  // prevListenerFunc required to clean up mouse event listeners after switching documents
  var prevListenerFunc;
  // keep track of previously created annotations so that they can be cleaned up
  var prevAnnotations = [];
  $(document).on('documentLoaded', function() {
    PDFNet.initialize().then(function() {
      // get document
      var stillRunning = false;
      var documentViewer = readerControl.docViewer;
      var doc = documentViewer.getDocument();
      doc.getPDFDoc().then(function(pdfDoc) {
        if (prevListenerFunc) {
          // If we have a previously loaded pdf document, remove any event listeners from that document.
          documentViewer.getViewer()[0].removeEventListener('mousedown', prevListenerFunc);
          // Clear out any information about the pdf's elements we may have stored.
          pageElementDataList = [];
        }
        var handleMouseClick = function(evt) {
          // Make a check to see if processes are still running to prevent multiple from running at same time.
          if (!stillRunning) {
            stillRunning = true;
            var annotManager = readerControl.docViewer.getAnnotationManager();
            if (prevAnnotations.length > 0) {
              for (var i = 0; i < prevAnnotations.length; i++) {
                annotManager.deleteAnnotation(prevAnnotations[i]);
              }
              prevAnnotations = [];
            }
            console.log('MouseClick X: ' + evt.pageX + ', MouseClick Y: ' + evt.pageY);

            // Get the Window coordinates
            var scrollContainer = $('#DocumentViewer');
            var viewportTop = scrollContainer.scrollTop();
            var viewportLeft = scrollContainer.scrollLeft();
            var windowCoord = { x: (evt.pageX + viewportLeft), y: (evt.pageY + viewportTop) };

            var displayModeManager = documentViewer.getDisplayModeManager();
            var displayMode = displayModeManager.getDisplayMode();
            // Get which page was clicked on
            var pageIndex = displayMode.getSelectedPages(windowCoord, windowCoord).first;

            pdfDoc.requirePage(pageIndex + 1).then(function() {
              // Get the context from the doc which is used for properly reading the elements on the pdf document.
              return doc.extractPDFNetLayersContext(); // layers context object, whenever layers changed, want to recalculate.
            }).then(function(layersContextID) {
              // running custom PDFNetJS script
              return runCustomScript(pdfDoc, layersContextID, windowCoord, pageIndex, documentViewer, Annotations, annotManager);
            }).then(function() {
              console.log('finished script');
              // refresh information on viewer and update appearance
              documentViewer.updateView();
              stillRunning = false;
            });
          }
        };
        prevListenerFunc = handleMouseClick;
        documentViewer.getViewer()[0].addEventListener('mousedown', handleMouseClick);
      });
    });
  });

  var runCustomScript = function(pdfDoc, layersContextID, windowCoord, pageIndex, documentViewer, Annotations, annotManager) {
    // eslint-disable-next-line no-unused-vars
    function* setPoint(pdfCoord, pageIndex, builder, writer, rectImg, testSize) {
      var size = 5;
      if (testSize !== undefined) {
        size = testSize;
      }
      var posMatrix = yield PDFNet.Matrix2D.create(size, 0, 0, size, pdfCoord.x - 2.5, pdfCoord.y - 2.5);
      var rectElement = yield builder.createImageFromMatrix(rectImg, posMatrix);
      writer.writePlacedElement(rectElement);
    }

    function* DrawRectangleAnnot(pageIndex, x1, y1, x2, y2) {
      var p1 = docCore.getViewerCoordinates(pageIndex, x1, y1);
      var p2 = docCore.getViewerCoordinates(pageIndex, x2, y2);

      var displayAnnot = new Annotations.RectangleAnnotation();
      displayAnnot.setPageNumber(pageIndex + 1);
      displayAnnot.setRect(new Annotations.Rect(p1.x, Math.min(p1.y, p2.y), p2.x, Math.max(p1.y, p2.y)));
      annotManager.addAnnotation(displayAnnot);
      prevAnnotations.push(displayAnnot);
    }

    function* DrawPointAnnot(pageIndex, x, y) {
      var p1 = docCore.getViewerCoordinates(pageIndex, x, y);
      var p2 = docCore.getViewerCoordinates(pageIndex, x, y);
      p1.x -= 2;
      p1.y -= 2;
      p2.x += 2;
      p2.y += 2;
      var displayAnnot = new Annotations.RectangleAnnotation();
      displayAnnot.setPageNumber(pageIndex + 1);

      displayAnnot.FillColor = new Annotations.Color(255, 255, 0, 1);
      displayAnnot.StrokeColor = new Annotations.Color(255, 0, 0, 1);

      displayAnnot.setRect(new Annotations.Rect(p1.x, Math.min(p1.y, p2.y), p2.x, Math.max(p1.y, p2.y)));
      annotManager.addAnnotation(displayAnnot);
      prevAnnotations.push(displayAnnot);
    }

    function* ProcessElements(pageElementData, page_builder, doc, page, pageIndex, pdfMousePoint, selectTopElementOnly) {
      // Read page contents, last object is top object
      var pageRotMtx = yield page.getDefaultMatrix();
      pageRotMtx = yield pageRotMtx.inverse();
      var rotatedMousePoint = yield pageRotMtx.mult(pdfMousePoint.x, pdfMousePoint.y);
      // (optional) display mouse point
      // yield * DrawPointAnnot(pageIndex, rotatedMousePoint.x, rotatedMousePoint.y);
      for (var elementNum = pageElementData.length - 1; elementNum >= 0; elementNum--) {
        var element = pageElementData[elementNum];
        var elementBBox = element.bbox;
        // Check bounding box
        if (elementBBox.x1 < rotatedMousePoint.x && elementBBox.x2 > rotatedMousePoint.x && elementBBox.y1 < rotatedMousePoint.y && elementBBox.y2 > rotatedMousePoint.y) {
          console.log('bounding box detected');
        } else {
          // mouseclick outside of any available bbox;
          continue;
        }
        yield* DrawRectangleAnnot(pageIndex, elementBBox.x1, elementBBox.y1, elementBBox.x2, elementBBox.y2);
        if (element.name === 'path') {
          yield* ProcessPaths(element.operators, element.points, element.ctm, pageIndex);
        }
        if (selectTopElementOnly) {
          break;
        }
      }
    }

    // Draw out all path points
    function* ProcessPaths(opr, pointList, currTransMtx, pageIndex) {
      var point_index = 0;
      if (opr.length > 4000) {
        console.log('Processing ' + opr.length + ' points. This will take significant time.');
      } else if (opr.length > 500) {
        console.log('Processing ' + opr.length + ' points. This may take some time.');
      }

      var x1, y1, pagePoint;

      for (var opr_index = 0; opr_index < opr.length; ++opr_index) {
        switch (opr[opr_index]) {
          case PDFNet.Element.PathSegmentType.e_moveto:
            // code to handle move segments
            x1 = pointList[point_index]; ++point_index;
            y1 = pointList[point_index]; ++point_index;
            pagePoint = yield currTransMtx.mult(x1, y1);
            yield* DrawPointAnnot(pageIndex, pagePoint.x, pagePoint.y);
            break;
          case PDFNet.Element.PathSegmentType.e_lineto:
            // code to handle line segments
            x1 = pointList[point_index]; ++point_index;
            y1 = pointList[point_index]; ++point_index;
            pagePoint = yield currTransMtx.mult(x1, y1);
            yield* DrawPointAnnot(pageIndex, pagePoint.x, pagePoint.y);
            break;
          case PDFNet.Element.PathSegmentType.e_cubicto:
            // code to handle cubic segments
            x1 = pointList[point_index]; ++point_index;
            y1 = pointList[point_index]; ++point_index;
            x2 = pointList[point_index]; ++point_index;
            y2 = pointList[point_index]; ++point_index;
            x3 = pointList[point_index]; ++point_index;
            y3 = pointList[point_index]; ++point_index;
            pagePoint = yield currTransMtx.mult(x3, y3);
            yield* DrawPointAnnot(pageIndex, pagePoint.x, pagePoint.y);
            break;
          case PDFNet.Element.PathSegmentType.e_rect:
            // code to handle rect segments
            x1 = pointList[point_index]; ++point_index;
            y1 = pointList[point_index]; ++point_index;
            var w = pointList[point_index]; ++point_index;
            var h = pointList[point_index]; ++point_index;
            var x2 = x1 + w;
            var y2 = y1;
            var x3 = x2;
            var y3 = y1 + h;
            var x4 = x1;
            var y4 = y3;
            var pagePoint1 = yield currTransMtx.mult(x1, y1);
            var pagePoint2 = yield currTransMtx.mult(x2, y2);
            var pagePoint3 = yield currTransMtx.mult(x3, y3);
            var pagePoint4 = yield currTransMtx.mult(x4, y4);

            yield* DrawPointAnnot(pageIndex, pagePoint1.x, pagePoint1.y);
            yield* DrawPointAnnot(pageIndex, pagePoint2.x, pagePoint2.y);
            yield* DrawPointAnnot(pageIndex, pagePoint3.x, pagePoint3.y);
            yield* DrawPointAnnot(pageIndex, pagePoint4.x, pagePoint4.y);
            break;
          case PDFNet.Element.PathSegmentType.e_closepath:
            break;
          default:
            break;
        }
      }
      // ensure that we update the view
      annotManager.drawAnnotations(pageIndex + 1);
    }

    // Store all information we need so that we won't have to do this a second time.
    function* ExtractElements(page_reader) {
      var elementArray = [];
      // Read page contents
      for (var element = (yield page_reader.next()); element !== null; element = (yield page_reader.next())) {
        // does not display invisible elements or clipping path elements
        if (!(yield element.isOCVisible()) || (yield element.isClippingPath())) {
          continue;
        }
        // trace out images and paths (does not include text)
        var ctm = yield element.getCTM();
        var elemType = yield element.getType();
        var elementBBox, retObj;
        switch (elemType) {
          case PDFNet.Element.Type.e_path: // Process path data
            {
              // extract path information
              var pathinfo = yield element.getPathData();
              var opr = new Uint8Array(pathinfo.operators);
              var points = new Float64Array(pathinfo.points);
              elementBBox = yield element.getBBox();
              retObj = {
                name: 'path', type: elemType, ctm: ctm, operators: opr, points: points, bbox: elementBBox
              };
              elementArray.push(retObj);
            }
            break;
          case PDFNet.Element.Type.e_image: // Process image data
            {
              elementBBox = yield element.getBBox();
              var elementXObj = yield element.getXObject();
              var elementNum = yield elementXObj.getObjNum();
              retObj = {
                name: 'image', type: elemType, num: elementNum, ctm: ctm, bbox: elementBBox
              };
              elementArray.push(retObj);
            }
            break;
          case PDFNet.Element.Type.e_form: // Process form XObjects
            {
              page_reader.formBegin();
              var elemArray2 = yield* ExtractElements(page_reader);
              elementArray = elementArray.concat(elemArray2);
              page_reader.end();
            }
            break;
          default:
            break;
        }
      }
      return elementArray;
    }


    var displayModeManager = documentViewer.getDisplayModeManager();
    var displayMode = displayModeManager.getDisplayMode();
    var docCore = documentViewer.getDocument();
    function* main() {
      // eslint-disable-next-line no-unused-vars
      var ret = 0;
      try {
        var doc = pdfDoc;
        doc.lock();
        doc.initSecurityHandler();

        // to select all elements underneath mouse click instead of just the top-most element, change to false.
        var selectTopElementOnly = true;

        var pageNum = pageIndex + 1;
        var viewerPageCoord = displayMode.windowToPage(windowCoord, pageIndex);
        var pdfCoord = docCore.getPDFCoordinates(pageIndex, viewerPageCoord.x, viewerPageCoord.y);

        var page_reader = yield PDFNet.ElementReader.create();
        var page_builder = yield PDFNet.ElementBuilder.create();

        var currPage = yield doc.getPage(pageNum);
        // making sure mouse position is adjusted for rotations
        var pageRotMtx = yield currPage.getDefaultMatrix();
        pdfCoord = yield pageRotMtx.mult(pdfCoord.x, pdfCoord.y);

        var pageElementData = pageElementDataList[pageIndex];
        var layersContext;
        // Read from the document and find its relevant elements if we haven't done so before.
        if (pageElementData === undefined) {
          currPage = yield doc.getPage(pageNum);
          layersContext = new PDFNet.OCGContext(layersContextID);
          page_reader.beginOnPage(currPage, layersContext);

          pageElementData = yield* ExtractElements(page_reader);
          pageElementDataList[pageIndex] = pageElementData;
          page_reader.end();
        }

        // Process the found elements
        currPage = yield doc.getPage(pageNum);
        layersContext = new PDFNet.OCGContext(layersContextID);
        yield* ProcessElements(pageElementData, page_builder, doc, currPage, pageIndex, pdfCoord, selectTopElementOnly);

        var sq = yield PDFNet.SquareAnnot.create(doc, PDFNet.Rect(10, 200, 800, 300));
        sq.setColor((yield PDFNet.ColorPt.init(0, 0, 0)), 3);
        sq.refreshAppearance();
        currPage.annotPushBack(sq);
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }
    }

    // start the generator
    return PDFNet.runGeneratorWithCleanup(main());
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=config.js