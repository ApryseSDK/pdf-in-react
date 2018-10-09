//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runAnnotationTest = function() {
    function* AnnotationLowLevelAPI(doc) {
      try {
        yield PDFNet.startDeallocateStack(); // start stack-based deallocation. All objects will be deallocated by end of function
        console.log('running LowLevelAPI');
        var itr = yield doc.getPageIterator(1);
        var page = yield itr.current();

        var annots = yield page.getAnnots();

        if (annots == null) {
          // If there are no annotations, create a new annotation
          // array for the page.
          annots = yield doc.createIndirectArray();
          var sdfDoc = yield page.getSDFObj();
          yield sdfDoc.put('Annots', annots);
        }

        // Create a Text annotation
        var annot = yield doc.createIndirectDict();
        yield annot.putName('Subtype', 'Text');
        yield annot.putBool('Open', true);
        yield annot.putString('Contents', 'The quick brown fox ate the lazy mouse.');
        yield annot.putRect('Rect', 266, 116, 430, 204);

        // Insert the annotation in the page annotation array
        yield annots.pushBack(annot);

        // Create a Link annotation
        var link1 = yield doc.createIndirectDict();
        yield link1.putName('Subtype', 'Link');
        var dest = yield PDFNet.Destination.createFit((yield doc.getPage(2)));
        yield link1.put('Dest', (yield dest.getSDFObj()));
        yield link1.putRect('Rect', 85, 705, 503, 661);
        yield annots.pushBack(link1);

        // Create another Link annotation
        var link2 = yield doc.createIndirectDict();
        yield link2.putName('Subtype', 'Link');
        var dest2 = yield PDFNet.Destination.createFit((yield doc.getPage(3)));
        yield link2.put('Dest', (yield dest2.getSDFObj()));
        yield link2.putRect('Rect', 85, 638, 503, 594);
        yield annots.pushBack(link2);

        // link2 = annots.GetAt(annots.Size()-1);
        var tenthPage = yield doc.getPage(10);
        // XYZ destination stands for 'left', 'top' and 'zoom' coordinates
        var XYZDestination = yield PDFNet.Destination.createXYZ(tenthPage, 100, 722, 10);
        yield link2.put('Dest', (yield XYZDestination.getSDFObj()));

        // Create a third link annotation with a hyperlink action (all other
        // annotation types can be created in a similar way)
        var link3 = yield doc.createIndirectDict();
        yield link3.putName('Subtype', 'Link');
        yield link3.putRect('Rect', 85, 570, 503, 524);

        // Create a URI action
        var action = yield link3.putDict('A');
        yield action.putName('S', 'URI');
        yield action.putString('URI', 'http://www.pdftron.com');

        yield annots.pushBack(link3);
        console.log('AnnotationLowLevel Done.');
        yield PDFNet.endDeallocateStack();
      } catch (err) {
        console.log(err);
      }
    }

    function* AnnotationHighLevelAPI(doc) {
      yield PDFNet.startDeallocateStack(); // start stack-based deallocation. All objects will be deallocated by end of function
      var first_page = yield doc.getPage(1);

      // The following code snippet traverses all annotations in the document
      console.log('Traversing all annotations in the document...');

      var first_page = yield doc.getPage(1);

      var page_num = 0;
      var itr = yield doc.getPageIterator(1);
      for (itr; (yield itr.hasNext()); (yield itr.next())) {
        page_num += 1;
        console.log('Page ' + page_num + ': ');
        var page = yield itr.current();
        var num_annots = yield page.getNumAnnots();
        for (var i = 0; i < num_annots; ++i) {
          var annot = yield page.getAnnot(i);
          if (!(yield annot.isValid())) {
            continue;
          }

          var annotSDF = yield annot.getSDFObj();
          var subType = yield annotSDF.get('Subtype');
          var subTypeVal = yield subType.value();

          var outputString = 'Annot Type: ' + (yield subTypeVal.getName());

          var bbox = yield annot.getRect();
          outputString += ';  Position: ' + bbox.x1 + ', ' + bbox.y1 + ', ' + bbox.x2 + ', ' + bbox.y2;
          console.log(outputString);
          var annotType = yield annot.getType();
          switch (annotType) {
            case PDFNet.Annot.Type.e_Link:
              {
                var link = yield PDFNet.LinkAnnot.createFromAnnot(annot);
                var action = yield link.getAction();
                if (!(yield action.isValid())) {
                  continue;
                }

                if ((yield action.getType()) === PDFNet.Action.Type.e_GoTo) {
                  var dest = yield action.getDest();
                  if (!(yield dest.isValid())) {
                    console.log('  Destination is not valid');
                  } else {
                    var page_num_out = yield (yield dest.getPage()).getIndex();
                    console.log('  Links to: page number ' + page_num_out + ' in this document');
                  }
                } else if ((yield action.getType()) === PDFNet.Action.Type.e_URI) {
                  var SDFObj = yield action.getSDFObj();
                  var URI = yield SDFObj.get('URI');
                  var URIval = yield URI.value();
                  var URIText = yield URIval.getAsPDFText(); // An Exception is thrown if this is not a Obj::Type::e_string.
                  console.log(' Links to: ' + URIText); // Other get methods such as getNumber do not work either, although some do, so confusing.
                  // deallocate dictionary object on C side
                  URI.destroy();
                }
              }
              break;
            case PDFNet.Annot.Type.e_Widget:
              break;
            case PDFNet.Annot.Type.e_FileAttachment:
              break;
            default:
              break;
          }

          yield subType.destroy();
        }
      }
      // create a hyperlink
      var first_page = yield doc.getPage(1);
      var createURIAction = yield PDFNet.Action.createURI(doc, 'http://www.pdftron.com');
      var linkRect = new PDFNet.Rect(85, 570, 503, 524);
      var hyperlink = yield PDFNet.LinkAnnot.create(doc, linkRect);
      yield hyperlink.setAction(createURIAction);
      yield first_page.annotPushBack(hyperlink);

      // Create an intra-document link...
      var page3 = yield doc.getPage(3);
      var goto_page_3 = yield PDFNet.Action.createGoto(yield PDFNet.Destination.createFitH(page3, 0));
      var link = yield PDFNet.LinkAnnot.create(doc, (new PDFNet.Rect(85, 458, 503, 502)));
      yield link.setAction(goto_page_3);

      // Set the annotation border width to 3 points...
      var border_style = yield PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 3, 0, 0);
      link.setBorderStyle(border_style, false); // default false
      var greenColorPt = yield PDFNet.ColorPt.init(0, 0, 1, 0);
      yield link.setColorDefault(greenColorPt);
      yield first_page.annotPushBack(link);

      // Create a stamp annotation ...
      var stamp = yield PDFNet.RubberStampAnnot.create(doc, (new PDFNet.Rect(30, 30, 300, 200)));
      yield stamp.setIconName('Draft');
      yield first_page.annotPushBack(stamp);


      var ink = yield PDFNet.InkAnnot.create(doc, (new PDFNet.Rect(110, 10, 300, 200)));
      var pt3 = new PDFNet.Point(110, 10);
      yield ink.setPoint(0, 0, pt3);
      pt3.x = 150;
      pt3.y = 50;
      yield ink.setPoint(0, 1, pt3);
      pt3.x = 190;
      pt3.y = 60;
      yield ink.setPoint(0, 2, pt3);
      pt3.x = 180;
      pt3.y = 90;
      yield ink.setPoint(1, 0, pt3);
      pt3.x = 190;
      pt3.y = 95;
      yield ink.setPoint(1, 1, pt3);
      pt3.x = 200;
      pt3.y = 100;
      yield ink.setPoint(1, 2, pt3);
      pt3.x = 166;
      pt3.y = 86;
      yield ink.setPoint(2, 0, pt3);
      pt3.x = 196;
      pt3.y = 96;
      yield ink.setPoint(2, 1, pt3);
      pt3.x = 221;
      pt3.y = 121;
      yield ink.setPoint(2, 2, pt3);
      pt3.x = 288;
      pt3.y = 188;
      yield ink.setPoint(2, 3, pt3);
      var cyanColorPt = yield PDFNet.ColorPt.init(0, 1, 1, 0);
      yield ink.setColor(cyanColorPt, 3);
      first_page.annotPushBack(ink);

      yield PDFNet.endDeallocateStack();
    }

    function* CreateTestAnnots(doc) {
      yield PDFNet.startDeallocateStack();
      var ew = yield PDFNet.ElementWriter.create(); // elementWriter
      var eb = yield PDFNet.ElementBuilder.create(); // elementBuilder
      var element;

      var first_page = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      doc.pagePushBack(first_page);
      ew.beginOnPage(first_page, PDFNet.ElementWriter.WriteMode.e_overlay, false); // begin writing to this page
      ew.end(); // save changes to the current page

      // NOTE: The following code represents three different ways to create a text annotation.
      {
        var txtannot = yield PDFNet.FreeTextAnnot.create(doc, new PDFNet.Rect(10, 400, 160, 570));
        yield txtannot.setContents('\n\nSome swift brown fox snatched a gray hare out of the air by freezing it with an angry glare.\n\nAha!\n\nAnd there was much rejoicing!');
        var solidLine = yield PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 1, 10, 20);
        yield txtannot.setBorderStyle(solidLine, true);
        yield txtannot.setQuaddingFormat(0);
        yield first_page.annotPushBack(txtannot);
        yield txtannot.refreshAppearance();
      }

      {
        var txtannot = yield PDFNet.FreeTextAnnot.create(doc, new PDFNet.Rect(100, 100, 350, 500));
        yield txtannot.setContentRect(new PDFNet.Rect(200, 200, 350, 500));
        yield txtannot.setContents('\n\nSome swift brown fox snatched a gray hare out of the air by freezing it with an angry glare.\n\nAha!\n\nAnd there was much rejoicing!');
        yield txtannot.setCalloutLinePoints(new PDFNet.Point(200, 300), new PDFNet.Point(150, 290), new PDFNet.Point(110, 110));
        var solidLine = yield PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 1, 10, 20);
        yield txtannot.setBorderStyle(solidLine, true);
        yield txtannot.setEndingStyle(PDFNet.LineAnnot.EndingStyle.e_ClosedArrow);
        var greenColorPt = yield PDFNet.ColorPt.init(0, 1, 0, 0);
        yield txtannot.setColorDefault(greenColorPt); // default value of last param is 0
        yield txtannot.setQuaddingFormat(1);
        yield first_page.annotPushBack(txtannot);
        yield txtannot.refreshAppearance();
      }
      {
        var txtannot = yield PDFNet.FreeTextAnnot.create(doc, new PDFNet.Rect(400, 10, 550, 400));
        yield txtannot.setContents('\n\nSome swift brown fox snatched a gray hare out of the air by freezing it with an angry glare.\n\nAha!\n\nAnd there was much rejoicing!');
        var solidLine = yield PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 1, 10, 20);
        yield txtannot.setBorderStyle(solidLine, true);
        var redColorPt = yield PDFNet.ColorPt.init(0, 0, 1, 0);
        yield txtannot.setColorDefault(redColorPt);
        yield txtannot.setOpacity(0.2);
        yield txtannot.setQuaddingFormat(2);
        yield first_page.annotPushBack(txtannot);
        yield txtannot.refreshAppearance();
      }
      var page = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      doc.pagePushBack(page);
      yield ew.beginOnPage(page, PDFNet.ElementWriter.WriteMode.e_overlay, false);
      yield eb.reset(new PDFNet.GState('0'));
      yield ew.end(); // save changes to the current page
      {
        // Create a Line annotation...
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(250, 250, 400, 400));
        yield line.setStartPoint(new PDFNet.Point(350, 270));
        yield line.setEndPoint(new PDFNet.Point(260, 370));
        yield line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Square);
        yield line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        var darkGreenColorPt = yield PDFNet.ColorPt.init(0.3, 0.5, 0, 0);
        yield line.setColor(darkGreenColorPt, 3);
        yield line.setContents('Dashed Captioned');
        yield line.setShowCaption(true);
        yield line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        var dash = new Float64Array([2.0, 2.0]);
        var bStyle = yield PDFNet.AnnotBorderStyle.createWithDashPattern(PDFNet.AnnotBorderStyle.Style.e_dashed, 2, 0, 0, dash);
        line.setBorderStyle(bStyle, false);
        line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(347, 377, 600, 600));
        yield line.setStartPoint(new PDFNet.Point(385, 410));
        yield line.setEndPoint(new PDFNet.Point(540, 555));
        yield line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        yield line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_OpenArrow);
        var redColorPt = yield PDFNet.ColorPt.init(1, 0, 0, 0);
        yield line.setColor(redColorPt, 3);
        var greenColorPt = yield PDFNet.ColorPt.init(0, 1, 0, 0);
        yield line.setInteriorColor(greenColorPt, 3);
        yield line.setContents('Inline Caption');
        yield line.setShowCaption(true);
        yield line.setCapPos(PDFNet.LineAnnot.CapPos.e_Inline);
        yield line.setLeaderLineExtensionLength(-4.0);
        yield line.setLeaderLineLength(-12);
        yield line.setLeaderLineOffset(2.0);
        yield line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(10, 400, 200, 600));
        yield line.setStartPoint(new PDFNet.Point(25, 426));
        yield line.setEndPoint(new PDFNet.Point(180, 555));
        yield line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        yield line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Square);
        var blueColorPt = yield PDFNet.ColorPt.init(0, 0, 1, 0);
        yield line.setColor(blueColorPt, 3);
        var redColorPt = yield PDFNet.ColorPt.init(1, 0, 0, 0);
        yield line.setInteriorColor(redColorPt, 3);
        yield line.setContents('Offset Caption');
        yield line.setShowCaption(true);
        yield line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        yield line.setTextHOffset(-60);
        yield line.setTextVOffset(10);
        yield line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(200, 10, 400, 70));
        line.setStartPoint(new PDFNet.Point(220, 25));
        line.setEndPoint(new PDFNet.Point(370, 60));
        line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Butt);
        line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_OpenArrow);
        line.setColor((yield PDFNet.ColorPt.init(0, 0, 1)), 3);
        line.setContents('Regular Caption');
        line.setShowCaption(true);
        line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        yield line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(200, 70, 400, 130));
        line.setStartPoint(new PDFNet.Point(220, 111));
        line.setEndPoint(new PDFNet.Point(370, 78));
        line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Diamond);
        line.setContents('Circle to Diamond');
        line.setColor((yield PDFNet.ColorPt.init(0, 0, 1)), 3);
        line.setInteriorColor((yield PDFNet.ColorPt.init(0, 1, 0)), 3);
        line.setShowCaption(true);
        line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(10, 100, 160, 200));
        line.setStartPoint(new PDFNet.Point(15, 110));
        line.setEndPoint(new PDFNet.Point(150, 190));
        line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Slash);
        line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_ClosedArrow);
        line.setContents('Slash to CArrow');
        line.setColor((yield PDFNet.ColorPt.init(1, 0, 0)), 3);
        line.setInteriorColor((yield PDFNet.ColorPt.init(0, 1, 1)), 3);
        line.setShowCaption(true);
        line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(270, 270, 570, 433));
        line.setStartPoint(new PDFNet.Point(300, 400));
        line.setEndPoint(new PDFNet.Point(550, 300));
        line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_RClosedArrow);
        line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_ROpenArrow);
        line.setContents('ROpen & RClosed arrows');
        line.setColor((yield PDFNet.ColorPt.init(0, 0, 1)), 3);
        line.setInteriorColor((yield PDFNet.ColorPt.init(0, 1, 0)), 3);
        line.setShowCaption(true);
        line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(195, 395, 205, 505));
        line.setStartPoint(new PDFNet.Point(200, 400));
        line.setEndPoint(new PDFNet.Point(200, 500));
        line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(55, 299, 150, 301));
        line.setStartPoint(new PDFNet.Point(55, 300));
        line.setEndPoint(new PDFNet.Point(155, 300));
        line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        line.setContents(("Caption that's longer than its line."));
        line.setColor((yield PDFNet.ColorPt.init(1, 0, 1)), 3);
        line.setInteriorColor((yield PDFNet.ColorPt.init(0, 1, 0)), 3);
        line.setShowCaption(true);
        line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        line.refreshAppearance();
        page.annotPushBack(line);
      }
      {
        var line = yield PDFNet.LineAnnot.create(doc, new PDFNet.Rect(300, 200, 390, 234));
        line.setStartPoint(new PDFNet.Point(310, 210));
        line.setEndPoint(new PDFNet.Point(380, 220));
        line.setColor((yield PDFNet.ColorPt.init(0, 0, 0)), 3);
        line.refreshAppearance();
        page.annotPushBack(line);
      }
      var page3 = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      ew.beginOnPage(page3); // begin writing to the page
      ew.end(); // save changes to the current page
      doc.pagePushBack(page3);
      {
        var circle = yield PDFNet.CircleAnnot.create(doc, new PDFNet.Rect(300, 300, 390, 350));
        circle.setColor((yield PDFNet.ColorPt.init(0, 0, 0)), 3);
        circle.refreshAppearance();
        page3.annotPushBack(circle);
      }
      {
        var circle = yield PDFNet.CircleAnnot.create(doc, new PDFNet.Rect(100, 100, 200, 200));
        circle.setColor((yield PDFNet.ColorPt.init(0, 1, 0)), 3);
        circle.setInteriorColor((yield PDFNet.ColorPt.init(0, 0, 1)), 3);
        var dash = [2, 4];
        circle.setBorderStyle((yield PDFNet.AnnotBorderStyle.createWithDashPattern(PDFNet.AnnotBorderStyle.Style.e_dashed, 3, 0, 0, dash)));
        circle.setPadding(new PDFNet.Rect(2, 2, 2, 2));
        circle.refreshAppearance();
        page3.annotPushBack(circle);
      }
      {
        var sq = yield PDFNet.SquareAnnot.create(doc, new PDFNet.Rect(10, 200, 80, 300));
        sq.setColor((yield PDFNet.ColorPt.init(0, 0, 0)), 3);
        sq.refreshAppearance();
        page3.annotPushBack(sq);
      }

      {
        var sq = yield PDFNet.SquareAnnot.create(doc, new PDFNet.Rect(500, 200, 580, 300));
        sq.setColor((yield PDFNet.ColorPt.init(1, 0, 0)), 3);
        sq.setInteriorColor((yield PDFNet.ColorPt.init(0, 1, 1)), 3);
        var dash = [4, 2];
        sq.setBorderStyle((yield PDFNet.AnnotBorderStyle.createWithDashPattern(PDFNet.AnnotBorderStyle.Style.e_dashed, 6, 0, 0, dash)));
        sq.setPadding(new PDFNet.Rect(4, 4, 4, 4));
        sq.refreshAppearance();
        page3.annotPushBack(sq);
      }

      {
        var poly = yield PDFNet.PolygonAnnot.create(doc, new PDFNet.Rect(5, 500, 125, 590));
        poly.setColor((yield PDFNet.ColorPt.init(1, 0, 0)), 3);
        poly.setInteriorColor((yield PDFNet.ColorPt.init(1, 1, 0)), 3);
        poly.setVertex(0, new PDFNet.Point(12, 510));
        poly.setVertex(1, new PDFNet.Point(100, 510));
        poly.setVertex(2, new PDFNet.Point(100, 555));
        poly.setVertex(3, new PDFNet.Point(35, 544));
        var solidBorderStyle = yield PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 4, 0, 0);
        poly.setBorderStyle(solidBorderStyle);
        poly.setPadding(new PDFNet.Rect(4, 4, 4, 4));
        poly.refreshAppearance();
        page3.annotPushBack(poly);
      }
      {
        var poly = yield PDFNet.PolyLineAnnot.create(doc, new PDFNet.Rect(400, 10, 500, 90));
        poly.setColor((yield PDFNet.ColorPt.init(1, 0, 0)), 3);
        poly.setInteriorColor((yield PDFNet.ColorPt.init(0, 1, 0)), 3);
        poly.setVertex(0, new PDFNet.Point(405, 20));
        poly.setVertex(1, new PDFNet.Point(440, 40));
        poly.setVertex(2, new PDFNet.Point(410, 60));
        poly.setVertex(3, new PDFNet.Point(470, 80));
        poly.setBorderStyle(yield PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 2, 0, 0));
        poly.setPadding(new PDFNet.Rect(4, 4, 4, 4));
        poly.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_RClosedArrow);
        poly.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_ClosedArrow);
        poly.refreshAppearance();
        page3.annotPushBack(poly);
      }
      {
        var lk = yield PDFNet.LinkAnnot.create(doc, new PDFNet.Rect(5, 5, 55, 24));
        // lk.setColor(yield PDFNet.ColorPt.init(0,1,0), 3 );
        lk.refreshAppearance();
        page3.annotPushBack(lk);
      }

      var page4 = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      ew.beginOnPage(page4); // begin writing to the page
      ew.end(); // save changes to the current page
      doc.pagePushBack(page4);

      {
        ew.beginOnPage(page4);
        var font = yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_helvetica);
        element = yield eb.createTextBeginWithFont(font, 16);
        element.setPathFill(true);
        ew.writeElement(element);
        element = yield eb.createTextRun('Some random text on the page', font, 16);
        element.setTextMatrixEntries(1, 0, 0, 1, 100, 500);
        ew.writeElement(element);
        ew.writeElement((yield eb.createTextEnd()));
        ew.end();
      }
      {
        var hl = yield PDFNet.HighlightAnnot.create(doc, new PDFNet.Rect(100, 490, 150, 515));
        hl.setColor((yield PDFNet.ColorPt.init(0, 1, 0)), 3);
        hl.refreshAppearance();
        page4.annotPushBack(hl);
      }
      {
        var sq = yield PDFNet.SquigglyAnnot.create(doc, new PDFNet.Rect(100, 450, 250, 600));
        // sq.setColor(yield PDFNet.ColorPt.init(1,0,0), 3 );
        sq.setQuadPoint(0, PDFNet.QuadPoint(122, 455, 240, 545, 230, 595, 101, 500));
        sq.refreshAppearance();
        page4.annotPushBack(sq);
      }
      {
        var cr = yield PDFNet.CaretAnnot.create(doc, new PDFNet.Rect(100, 40, 129, 69));
        cr.setColor((yield PDFNet.ColorPt.init(0, 0, 1)), 3);
        cr.setSymbol('P');
        cr.refreshAppearance();
        page4.annotPushBack(cr);
      }


      var page5 = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      ew.beginOnPage(page5); // begin writing to the page
      ew.end(); // save changes to the current page
      doc.pagePushBack(page5);
      var fs = yield PDFNet.FileSpec.create(doc, '../TestFiles/butterfly.png', false);
      var page6 = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      ew.beginOnPage(page6); // begin writing to the page
      ew.end(); // save changes to the current page
      doc.pagePushBack(page6);

      for (var ipage = 0; ipage < 2; ++ipage) {
        for (var iann = 0; iann < 100; iann++) {
          if (!(iann > PDFNet.FileAttachmentAnnot.Icon.e_Tag)) {
            var fa = yield PDFNet.FileAttachmentAnnot.createWithFileSpec(doc, new PDFNet.Rect(50 + 50 * iann, 100, 70 + 50 * iann, 120), fs, iann);
            if (ipage) {
              fa.setColor((yield PDFNet.ColorPt.init(1, 1, 0)));
            }
            fa.refreshAppearance();
            if (ipage === 0) {
              page5.annotPushBack(fa);
            } else {
              page6.annotPushBack(fa);
            }
          }
          if (iann > PDFNet.TextAnnot.Icon.e_Note) {
            break;
          }
          var txt = yield PDFNet.TextAnnot.create(doc, new PDFNet.Rect(10 + iann * 50, 200, 30 + iann * 50, 220));
          txt.setIcon(iann);
          txt.setContents((yield txt.getIconName()));
          if (ipage) {
            txt.setColor((yield PDFNet.ColorPt.init(1, 1, 0)));
          }
          txt.refreshAppearance();
          if (ipage === 0) {
            page5.annotPushBack(txt);
          } else {
            page6.annotPushBack(txt);
          }
        }
      }
      {
        var txt = yield PDFNet.TextAnnot.create(doc, new PDFNet.Rect(10, 20, 30, 40));
        txt.setIconName('UserIcon');
        txt.setContents('User defined icon, unrecognized by appearance generator');
        txt.setColor((yield PDFNet.ColorPt.init(0, 1, 0)));
        txt.refreshAppearance();
        page6.annotPushBack(txt);
      }
      {
        var ink = yield PDFNet.InkAnnot.create(doc, new PDFNet.Rect(100, 400, 200, 550));
        ink.setColor((yield PDFNet.ColorPt.init(0, 0, 1)));
        ink.setPoint(1, 3, new PDFNet.Point(220, 505));
        ink.setPoint(1, 0, new PDFNet.Point(100, 490));
        ink.setPoint(0, 1, new PDFNet.Point(120, 410));
        ink.setPoint(0, 0, new PDFNet.Point(100, 400));
        ink.setPoint(1, 2, new PDFNet.Point(180, 490));
        ink.setPoint(1, 1, new PDFNet.Point(140, 440));
        ink.setBorderStyle(yield PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 3, 0, 0));
        ink.refreshAppearance();
        page6.annotPushBack(ink);
      }


      var page7 = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      ew.beginOnPage(page7); // begin writing to the page
      ew.end(); // save changes to the current page
      doc.pagePushBack(page7);

      {
        var snd = yield PDFNet.SoundAnnot.create(doc, new PDFNet.Rect(100, 500, 120, 520));
        snd.setColor((yield PDFNet.ColorPt.init(1, 1, 0)));
        snd.setIcon(PDFNet.SoundAnnot.Icon.e_Speaker);
        snd.refreshAppearance();
        page7.annotPushBack(snd);
      }
      {
        var snd = yield PDFNet.SoundAnnot.create(doc, new PDFNet.Rect(200, 500, 220, 520));
        snd.setColor((yield PDFNet.ColorPt.init(1, 1, 0)));
        snd.setIcon(PDFNet.SoundAnnot.Icon.e_Mic);
        snd.refreshAppearance();
        page7.annotPushBack(snd);
      }

      var page8 = yield doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
      ew.beginOnPage(page8); // begin writing to the page
      ew.end(); // save changes to the current page
      doc.pagePushBack(page8);

      for (var ipage = 0; ipage < 2; ++ipage) {
        var px = 5;
        var py = 520;
        for (var istamp = PDFNet.RubberStampAnnot.Icon.e_Approved; istamp <= PDFNet.RubberStampAnnot.Icon.e_Draft; istamp++) {
          var st = yield PDFNet.RubberStampAnnot.create(doc, new PDFNet.Rect(1, 1, 100, 100));
          st.setIcon(istamp);
          st.setContents((yield st.getIconName()));
          st.setRect(new PDFNet.Rect(px, py, px + 100, py + 25));
          py -= 100;
          if (py < 0) {
            py = 520;
            px += 200;
          }
          if (ipage === 0) {
            // page7.annotPushBack( st );
          } else {
            page8.annotPushBack(st);
            st.refreshAppearance();
          }
        }
      }
      var st = yield PDFNet.RubberStampAnnot.create(doc, new PDFNet.Rect(400, 5, 550, 45));
      st.setIconName('UserStamp');
      st.setContents('User defined stamp');
      page8.annotPushBack(st);
      st.refreshAppearance();

      yield PDFNet.endDeallocateStack();
    }

    function* main() {
      try {
        console.log('Beginning Annotation Test. This test will add different annotations to PDF documents.');
        var ret = 0;

        var input_path = '../TestFiles/';
        var doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'numbered.pdf');
        doc.initSecurityHandler();
        doc.lock();

        console.log('PDFNet and PDF document initialized and locked');

        yield* AnnotationLowLevelAPI(doc);
        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'annotation_testLowLevel.pdf');

        // eslint-disable-next-line no-unused-vars
        var first_page = yield doc.getPage(1);

        yield* AnnotationHighLevelAPI(doc);
        var docbuf2 = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf2, 'annotation_testHighLevel.pdf');

        // creating various annotations in a brand new document
        var docnew = yield PDFNet.PDFDoc.create();
        docnew.lock();
        yield* CreateTestAnnots(docnew);
        var doc1buf = yield docnew.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(doc1buf, 'new_annot_test_api.pdf');
        console.log('Done.');
        return ret;
      } catch (err) {
        console.log(err);
      }
    }
    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=AnnotationTest.js