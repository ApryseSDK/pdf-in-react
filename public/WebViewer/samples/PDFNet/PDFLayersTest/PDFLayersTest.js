//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
(function(exports) {
  'use strict';

  exports.runPDFLayersTest = function() {
    // A utility function used to add new Content Groups (Layers) to the document.
    function* CreateLayer(doc, layer_name) {
      yield PDFNet.startDeallocateStack();
      var grp = yield PDFNet.OCG.create(doc, layer_name);
      var cfg = yield doc.getOCGConfig();
      if (cfg == null) {
        cfg = yield PDFNet.OCGConfig.create(doc, true);
        cfg.setName('Default');
      }

      // Add the new OCG to the list of layers that should appear in PDF viewer GUI.
      var layer_order_array = yield cfg.getOrder();
      if (layer_order_array == null) {
        layer_order_array = yield doc.createIndirectArray();
        cfg.setOrder(layer_order_array);
      }
      var grpSDFObj = yield grp.getSDFObj();
      layer_order_array.pushBack(grpSDFObj);

      yield PDFNet.endDeallocateStack();
      return grp;
    }

    // Creates some content (3 images) and associate them with the image layer
    function* CreateGroup1(doc, layer) {
      yield PDFNet.startDeallocateStack();
      var writer = yield PDFNet.ElementWriter.create();
      writer.begin(doc);

      // Create an Image that can be reused in the document or on the same page.
      var nullEncoderHints = new PDFNet.Obj('0');
      var img = yield PDFNet.Image.createFromURL(doc, '../TestFiles/peppers.jpg', nullEncoderHints);

      var builder = yield PDFNet.ElementBuilder.create();
      var imgWidth = yield img.getImageWidth();
      var imgHeight = yield img.getImageHeight();
      var imgMatrix = new PDFNet.Matrix2D(imgWidth / 2, -145, 20, imgHeight / 2, 200, 150);
      var element = yield builder.createImageFromMatrix(img, imgMatrix);
      writer.writePlacedElement(element);

      var gstate = yield element.getGState(); // use the same image (just change its matrix)
      gstate.setTransform(200, 0, 0, 300, 50, 450);
      writer.writePlacedElement(element);

      // use the same image again (just change its matrix).
      writer.writePlacedElement(yield builder.createImageScaled(img, 300, 600, 200, -150));

      var grp_obj = yield writer.end();

      // Indicate that this form (content group) belongs to the given layer (OCG).
      grp_obj.putName('Subtype', 'Form');
      grp_obj.put('OC', layer);
      grp_obj.putRect('BBox', 0, 0, 1000, 1000); // Set the clip box for the content.
      yield PDFNet.endDeallocateStack();

      return grp_obj;
    }

    function* CreateGroup2(doc, layer) {
      yield PDFNet.startDeallocateStack();
      var writer = yield PDFNet.ElementWriter.create();
      writer.begin(doc);

      // Create a path object in the shape of a heart.
      var builder = yield PDFNet.ElementBuilder.create();
      builder.pathBegin(); // start constructing the path
      builder.moveTo(306, 396);
      builder.curveTo(681, 771, 399.75, 864.75, 306, 771);
      builder.curveTo(212.25, 864.75, -69, 771, 306, 396);
      builder.closePath();
      var element = yield builder.pathEnd(); // the path geometry is now specified.

      // Set the path FILL color space and color.
      element.setPathFill(true);
      var gstate = yield element.getGState();
      var CMYKSpace = yield PDFNet.ColorSpace.createDeviceCMYK();
      gstate.setFillColorSpace(CMYKSpace);
      var cyanColorPt = yield PDFNet.ColorPt.init(1, 0, 0, 0); // CMYK
      gstate.setFillColorWithColorPt(cyanColorPt); // cyan

      // Set the path STROKE color space and color.
      element.setPathStroke(true);
      var RGBSpace = yield PDFNet.ColorSpace.createDeviceRGB();
      gstate.setStrokeColorSpace(RGBSpace);
      var redColorPt = yield PDFNet.ColorPt.init(1, 0, 0); // RGB
      gstate.setStrokeColorWithColorPt(redColorPt); // red
      gstate.setLineWidth(20);

      gstate.setTransform(0.5, 0, 0, 0.5, 280, 300);

      writer.writeElement(element);

      var grp_obj = yield writer.end();

      // Indicate that this form (content group) belongs to the given layer (OCG).
      grp_obj.putName('Subtype', 'Form');
      grp_obj.put('OC', layer);
      grp_obj.putRect('BBox', 0, 0, 1000, 1000); // Set the clip box for the content.

      yield PDFNet.endDeallocateStack();
      return grp_obj;
    }

    function* CreateGroup3(doc, layer) {
      yield PDFNet.startDeallocateStack();
      var writer = yield PDFNet.ElementWriter.create();
      writer.begin(doc);

      var builder = yield PDFNet.ElementBuilder.create();

      // Begin writing a block of text
      var textFont = yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman);
      var element = yield builder.createTextBeginWithFont(textFont, 120);
      writer.writeElement(element);

      element = yield builder.createNewTextRun('A text layer!');

      // Rotate text 45 degrees, than translate 180 pts horizontally and 100 pts vertically.
      var transform = yield PDFNet.Matrix2D.createRotationMatrix(-45 * (3.1415 / 180.0));
      yield transform.concat(1, 0, 0, 1, 180, 100);
      yield element.setTextMatrix(transform);

      yield writer.writeElement(element);
      yield writer.writeElement(yield builder.createTextEnd());

      var grp_obj = yield writer.end();

      // Indicate that this form (content group) belongs to the given layer (OCG).
      grp_obj.putName('Subtype', 'Form');
      grp_obj.put('OC', layer);
      grp_obj.putRect('BBox', 0, 0, 1000, 1000); // Set the clip box for the content.
      yield PDFNet.endDeallocateStack();
      return grp_obj;
    }


    function* main() {
      console.log('Beginning Test');
      // eslint-disable-next-line no-unused-vars
      var ret = 0;
      // Here we output a pdf document with layers.
      try {
        var doc = yield PDFNet.PDFDoc.create();
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDFNet and PDF document initialized and locked');

        var image_layer = yield* CreateLayer(doc, 'Image Layer');
        var text_layer = yield* CreateLayer(doc, 'Text Layer');
        var vector_layer = yield* CreateLayer(doc, 'Vector Layer');

        var page = yield doc.pageCreate();

        var builder = yield PDFNet.ElementBuilder.create();
        var writer = yield PDFNet.ElementWriter.create();
        writer.beginOnPage(page);

        var group_obj = yield* CreateGroup1(doc, (yield image_layer.getSDFObj()));
        var element = yield builder.createFormFromStream(group_obj);
        writer.writeElement(element);

        var group_obj2 = yield* CreateGroup2(doc, (yield vector_layer.getSDFObj()));
        element = yield builder.createFormFromStream(group_obj2);
        writer.writeElement(element);

        // eslint-disable-next-line no-constant-condition
        if (false) {
          // A bit more advanced example of how to create an OCMD text layer that
          // is visible only if text, image and path layers are all 'ON'.
          // An example of how to set 'Visibility Policy' in OCMD.
          var ocgs = doc.createIndirectArray();
          ocgs.pushBack(yield image_layer.getSDFObj());
          ocgs.pushBack(yield vector_layer.getSDFObj());
          ocgs.PushBack(yield text_layer.getSDFObj());
          var text_ocmd = yield PDFNet.OCMD.create(doc, ocgs, PDFNet.OCMD.VisibilityPolicyType.e_AllOn);
          element = yield builder.createFormFromStream(yield* CreateGroup3(doc, (yield text_ocmd.getSDFObj())));
        } else {
          // var SDFObj = yield text_layer.getSDFObj();
          element = yield builder.createFormFromStream(yield* CreateGroup3(doc, (yield text_layer.getSDFObj())));
        }
        writer.writeElement(element);

        // Add some content to the page that does not belong to any layer...
        // In this case this is a rectangle representing the page border.
        element = yield builder.createRect(0, 0, (yield page.getPageWidth()), (yield page.getPageHeight()));
        element.setPathFill(false);
        element.setPathStroke(true);
        var elementGState = yield element.getGState();
        elementGState.setLineWidth(40);
        writer.writeElement(element);

        writer.end(); // save changes to the current page
        doc.pagePushBack(page);

        // Set the default viewing preference to display 'Layer' tab.
        var prefs = yield doc.getViewPrefs();
        prefs.setPageMode(PDFNet.PDFDocViewPrefs.PageMode.e_UseOC);

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'pdf_layers.pdf');
        console.log('done example 1');
      } catch (err) {
        // console.log(err);
        console.log(err.stack);
        ret = 1;
      }

      // Here we output the individual layers as png files.
      try {
        // we are still using the doc from the previous section.
        if (!(yield doc.hasOC())) {
          console.log("The document does not contain 'Optional Content'");
        } else {
          var init_cfg = yield doc.getOCGConfig();
          var ctx = yield PDFNet.OCGContext.createFromConfig(init_cfg);

          var pdfdraw = yield PDFNet.PDFDraw.create();
          pdfdraw.setImageSize(1000, 1000);
          pdfdraw.setOCGContext(ctx);

          var page = yield doc.getPage(1);

          var firstPageBuffer = yield pdfdraw.exportStream(page);
          saveBufferAsPNG(firstPageBuffer, 'pdf_layers_default.png');

          ctx.setNonOCDrawing(false);

          var ocgs = yield doc.getOCGs();
          if (ocgs !== null) {
            var i;
            var sz = yield ocgs.size();
            for (i = 0; i < sz; ++i) {
              var ocg = yield PDFNet.OCG.createFromObj(yield ocgs.getAt(i));
              ctx.resetStates(false);
              ctx.setState(ocg, true);
              var fname = 'pdf_layers_';
              fname += yield ocg.getName();
              fname += '.png';
              var pageBuffer = yield pdfdraw.exportStream(page);
              saveBufferAsPNG(pageBuffer, fname);
            }
          }

          // Now draw content that is not part of any layer...
          ctx.setNonOCDrawing(true);
          ctx.setOCDrawMode(PDFNet.OCGContext.OCDrawMode.e_NoOC);
          var nonLayerBuffer = yield pdfdraw.exportStream(page);
          saveBufferAsPNG(nonLayerBuffer, 'pdf_layers_non_oc.png');
        }

        console.log('done');
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }
    }
    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=PDFLayersTest.js