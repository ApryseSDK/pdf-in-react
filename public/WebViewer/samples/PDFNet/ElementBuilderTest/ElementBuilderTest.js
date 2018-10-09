

(function(exports) {
  'use strict';

  exports.runElementBuilderTest = function() {
    function* main() {
      var ret = 0;

      // Relative path to the folder containing test files.
      var input_url = '../TestFiles/';

      try {
        var doc = yield PDFNet.PDFDoc.create();

        // ElementBuilder is used to build new Element objects
        var eb = yield PDFNet.ElementBuilder.create();
        // ElementWriter is used to write Elements to the page
        var writer = yield PDFNet.ElementWriter.create();

        var element;
        var gstate;

        // Start a new page ------------------------------------

        var pageRect = yield PDFNet.Rect.init(0, 0, 612, 794);
        var page = yield doc.pageCreate(pageRect);

        // begin writing to the page
        writer.beginOnPage(page);

        // Create an Image that can be reused in the document or on the same page.
        var img = yield PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');

        element = yield eb.createImageFromMatrix(img, yield PDFNet.Matrix2D.create((yield img.getImageWidth()) / 2, -145, 20, (yield img.getImageHeight()) / 2, 200, 150));
        writer.writePlacedElement(element);

        // use the same image (just change its matrix)
        gstate = yield element.getGState();
        gstate.setTransform(200, 0, 0, 300, 50, 450);
        writer.writePlacedElement(element);

        // use the same image again (just change its matrix).
        writer.writePlacedElement(yield eb.createImageScaled(img, 300, 600, 200, -150));

        writer.end(); // save changes to the current page
        doc.pagePushBack(page);

        // Start a new page ------------------------------------
        // Construct and draw a path object using different styles
        page = yield doc.pageCreate(pageRect);

        // begin writing to this page
        writer.beginOnPage(page);
        // Reset the GState to default
        eb.reset();

        // start constructing the path
        eb.pathBegin();
        eb.moveTo(306, 396);
        eb.curveTo(681, 771, 399.75, 864.75, 306, 771);
        eb.curveTo(212.25, 864.75, -69, 771, 306, 396);
        eb.closePath();
        // the path is now finished
        element = yield eb.pathEnd();
        // the path should be filled
        element.setPathFill(true);

        // Set the path color space and color
        gstate = yield element.getGState();
        gstate.setFillColorSpace(yield PDFNet.ColorSpace.createDeviceCMYK());
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(1, 0, 0, 0)); // cyan
        gstate.setTransform(0.5, 0, 0, 0.5, -20, 300);
        writer.writePlacedElement(element);

        // Draw the same path using a different stroke color
        // this path is should be filled and stroked
        element.setPathStroke(true);
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(0, 0, 1, 0)); // yellow
        gstate.setStrokeColorSpace(yield PDFNet.ColorSpace.createDeviceRGB());
        gstate.setStrokeColorWithColorPt(yield PDFNet.ColorPt.init(1, 0, 0)); // red
        gstate.setTransform(0.5, 0, 0, 0.5, 280, 300);
        gstate.setLineWidth(20);
        writer.writePlacedElement(element);

        // Draw the same path with with a given dash pattern
        // this path is should be only stroked
        element.setPathFill(false);
        gstate.setStrokeColorWithColorPt(yield PDFNet.ColorPt.init(0, 0, 1)); // blue
        gstate.setTransform(0.5, 0, 0, 0.5, 280, 0);
        var dash_pattern = [];
        dash_pattern.push(30);
        gstate.setDashPattern(dash_pattern, 0);
        writer.writePlacedElement(element);

        // Use the path as a clipping path
        // Save the graphics state
        writer.writeElement(yield eb.createGroupBegin());
        // Start constructing the new path (the old path was lost when we created
        // a new Element using CreateGroupBegin()).
        eb.pathBegin();
        eb.moveTo(306, 396);
        eb.curveTo(681, 771, 399.75, 864.75, 306, 771);
        eb.curveTo(212.25, 864.75, -69, 771, 306, 396);
        eb.closePath();
        // path is now constructed
        element = yield eb.pathEnd();
        // this path is a clipping path
        element.setPathClip(true);
        // this path should be filled and stroked
        element.setPathStroke(true);
        gstate = yield element.getGState();
        gstate.setTransform(0.5, 0, 0, 0.5, -20, 0);

        writer.writeElement(element);

        writer.writeElement(yield eb.createImageScaled(img, 100, 300, 400, 600));

        // Restore the graphics state
        writer.writeElement(yield eb.createGroupEnd());

        writer.end(); // save changes to the current page
        doc.pagePushBack(page);


        // Start a new page ------------------------------------
        page = yield doc.pageCreate(pageRect);

        // begin writing to this page
        writer.beginOnPage(page);
        // Reset the GState to default
        eb.reset();

        // Begin writing a block of text
        element = yield eb.createTextBeginWithFont(yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman), 12);
        writer.writeElement(element);

        element = yield eb.createNewTextRun('Hello World!');
        element.setTextMatrixEntries(10, 0, 0, 10, 0, 600);
        gstate = yield element.getGState();
        // Set the spacing between lines
        gstate.setLeading(15);
        writer.writeElement(element);

        writer.writeElement(yield eb.createTextNewLine()); // New line

        element = yield eb.createNewTextRun('Hello World!');
        gstate = yield element.getGState();
        gstate.setTextRenderMode(PDFNet.GState.TextRenderingMode.e_stroke_text);
        gstate.setCharSpacing(-1.25);
        gstate.setWordSpacing(-1.25);
        writer.writeElement(element);

        writer.writeElement(yield eb.createTextNewLine()); // New line

        element = yield eb.createNewTextRun('Hello World!');
        gstate = yield element.getGState();
        gstate.setCharSpacing(0);
        gstate.setWordSpacing(0);
        gstate.setLineWidth(3);
        gstate.setTextRenderMode(PDFNet.GState.TextRenderingMode.e_fill_stroke_text);
        gstate.setStrokeColorSpace(yield PDFNet.ColorSpace.createDeviceRGB());
        gstate.setStrokeColorWithColorPt(yield PDFNet.ColorPt.init(1, 0, 0)); // red
        gstate.setFillColorSpace(yield PDFNet.ColorSpace.createDeviceCMYK());
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(1, 0, 0, 0)); // cyan
        writer.writeElement(element);


        writer.writeElement(yield eb.createTextNewLine()); // New line

        // Set text as a clipping path to the image.
        element = yield eb.createNewTextRun('Hello World!');
        gstate = yield element.getGState();
        gstate.setTextRenderMode(PDFNet.GState.TextRenderingMode.e_clip_text);
        writer.writeElement(element);

        // Finish the block of text
        writer.writeElement(yield eb.createTextEnd());

        // Draw an image that will be clipped by the above text
        writer.writeElement(yield eb.createImageScaled(img, 10, 100, 1300, 720));

        writer.end(); // save changes to the current page
        doc.pagePushBack(page);

        // Start a new page ------------------------------------
        //
        // The example also shows how ElementReader can be used to copy and modify
        // Elements between pages.

        var reader = yield PDFNet.ElementReader.create();

        // Start reading Elements from the last page. We will copy all Elements to
        // a new page but will modify the font associated with text.
        reader.beginOnPage(yield doc.getPage(yield doc.getPageCount()));

        page = yield doc.pageCreate(yield PDFNet.Rect.init(0, 0, 1300, 794));

        // begin writing to this page
        writer.beginOnPage(page);
        // Reset the GState to default
        eb.reset();

        var font = yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_helvetica);

        // Read page contents
        while ((element = yield reader.next())) {
          if ((yield element.getType()) === PDFNet.Element.Type.e_text) {
            (yield element.getGState()).setFont(font, 14);
          }

          writer.writeElement(element);
        }

        reader.end();
        writer.end(); // save changes to the current page

        doc.pagePushBack(page);


        // Start a new page ------------------------------------
        //
        // The example also shows how ElementReader can be used to copy and modify
        // Elements between pages.

        // Start reading Elements from the last page. We will copy all Elements to
        // a new page but will modify the font associated with text.
        reader.beginOnPage(yield doc.getPage(yield doc.getPageCount()));

        page = yield doc.pageCreate(yield PDFNet.Rect.init(0, 0, 1300, 794));

        // begin writing to this page
        writer.beginOnPage(page);
        // Reset the GState to default
        eb.reset();

        // Embed an external font in the document.
        // MISSING createType1Font
        // Font font2 = Font::CreateType1Font(doc, (input_url + "Misc-Fixed.pfa").c_str());
        var font2 = yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_courier_bold);

        // Read page contents
        while ((element = yield reader.next())) {
          if ((yield element.getType()) === PDFNet.Element.Type.e_text) {
            (yield element.getGState()).setFont(font2, 16);
          }
          writer.writeElement(element);
        }

        reader.end();
        writer.end(); // save changes to the current page
        doc.pagePushBack(page);


        // Start a new page ------------------------------------
        page = yield doc.pageCreate();
        // begin writing to this page
        writer.beginOnPage(page);
        // Reset the GState to default
        eb.reset();

        // Begin writing a block of text
        element = yield eb.createTextBeginWithFont(yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman), 12);
        element.setTextMatrixEntries(1.5, 0, 0, 1.5, 50, 600);
        // Set the spacing between lines
        (yield element.getGState()).setLeading(15);
        writer.writeElement(element);


        var para = 'A PDF text object consists of operators that can show ' +
                        'text strings, move the text position, and set text state and certain ' +
                        'other parameters. In addition, there are three parameters that are ' +
                        'defined only within a text object and do not persist from one text ' +
                        'object to the next: Tm, the text matrix, Tlm, the text line matrix, ' +
                        'Trm, the text rendering matrix, actually just an intermediate result ' +
                        'that combines the effects of text state parameters, the text matrix ' +
                        '(Tm), and the current transformation matrix';

        var para_end = para.Length;
        var text_run = 0;
        var text_run_end;

        var para_width = 300; // paragraph width is 300 units
        var cur_width = 0;

        while (text_run < para_end) {
          text_run_end = para.indexOf(' ', text_run);
          if (text_run_end < 0) {
            text_run_end = para_end - 1;
          }

          var text = para.substring(text_run, text_run_end - text_run + 1);
          element = yield eb.createNewTextRun(text);
          if (cur_width + (yield element.getTextLength()) < para_width) {
            writer.writeElement(element);
            cur_width += yield element.getTextLength();
          } else {
            writer.writeElement(yield eb.createTextNewLine()); // New line
            text = para.substr(text_run, text_run_end - text_run + 1);
            element = yield eb.createNewTextRun(text);
            cur_width = yield element.getTextLength();
            writer.writeElement(element);
          }

          text_run = text_run_end + 1;
        }

        // -----------------------------------------------------------------------
        // The following code snippet illustrates how to adjust spacing between
        // characters (text runs).
        element = yield eb.createTextNewLine();
        writer.writeElement(element); // Skip 2 lines
        writer.writeElement(element);

        writer.writeElement(yield eb.createNewTextRun('An example of space adjustments between inter-characters:'));
        writer.writeElement(yield eb.createTextNewLine());

        // Write string "AWAY" without space adjustments between characters.
        element = yield eb.createNewTextRun('AWAY');
        writer.writeElement(element);

        writer.writeElement(yield eb.createTextNewLine());

        // Write string "AWAY" with space adjustments between characters.
        element = yield eb.createNewTextRun('A');
        writer.writeElement(element);

        element = yield eb.createNewTextRun('W');
        element.setPosAdjustment(140);
        writer.writeElement(element);

        element = yield eb.createNewTextRun('A');
        element.setPosAdjustment(140);
        writer.writeElement(element);

        element = yield eb.createNewTextRun('Y again');
        element.setPosAdjustment(115);
        writer.writeElement(element);

        // Draw the same strings using direct content output...
        writer.flush(); // flush pending Element writing operations.

        // You can also write page content directly to the content stream using
        // ElementWriter.WriteString(...) and ElementWriter.WriteBuffer(...) methods.
        // Note that if you are planning to use these functions you need to be familiar
        // with PDF page content operators (see Appendix A in PDF Reference Manual).
        // Because it is easy to make mistakes during direct output we recommend that
        // you use ElementBuilder and Element interface instead.

        writer.writeString('T* T* '); // Skip 2 lines
        writer.writeString('(Direct output to PDF page content stream:) Tj  T* ');
        writer.writeString('(AWAY) Tj T* ');
        writer.writeString('[(A)140(W)140(A)115(Y again)] TJ ');

        // Finish the block of text
        writer.writeElement(yield eb.createTextEnd());

        writer.end(); // save changes to the current page
        doc.pagePushBack(page);

        // Start a new page ------------------------------------

        // Image Masks
        //
        // In the opaque imaging model, images mark all areas they occupy on the page as
        // if with opaque paint. All portions of the image, whether black, white, gray,
        // or color, completely obscure any marks that may previously have existed in the
        // same place on the page.
        // In the graphic arts industry and page layout applications, however, it is common
        // to crop or 'mask out' the background of an image and then place the masked image
        // on a different background, allowing the existing background to show through the
        // masked areas. This sample illustrates how to use image masks.

        page = yield doc.pageCreate();
        // begin writing to the page
        writer.beginOnPage(page);


        // INVESTIGATE THIS SECTION

        // Create the Image Mask
        var embed_file = yield PDFNet.Filter.createURLFilter(input_url + 'imagemask.dat');
        var mask_read = yield PDFNet.FilterReader.create(embed_file);

        // INVESTIGATE THIS SECTION

        var device_gray = yield PDFNet.ColorSpace.createDeviceGray();
        var mask = yield PDFNet.Image.createDirectFromStream(doc, mask_read, 64, 64, 1, device_gray, PDFNet.Image.InputFilter.e_ascii_hex);

        (yield mask.getSDFObj()).putBool('ImageMask', true);

        element = yield eb.createRect(0, 0, 612, 794);
        element.setPathStroke(false);
        element.setPathFill(true);
        gstate = yield element.getGState();

        gstate.setFillColorSpace(device_gray);
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(0.8));
        writer.writePlacedElement(element);

        element = yield eb.createImageFromMatrix(mask, yield PDFNet.Matrix2D.create(200, 0, 0, -200, 40, 680));
        (yield element.getGState()).setFillColorWithColorPt(yield PDFNet.ColorPt.init(0.1));
        writer.writePlacedElement(element);

        gstate = yield element.getGState();
        gstate.setFillColorSpace(yield PDFNet.ColorSpace.createDeviceRGB());
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(1, 0, 0));
        element = yield eb.createImageFromMatrix(mask, yield PDFNet.Matrix2D.create(200, 0, 0, -200, 320, 680));
        writer.writePlacedElement(element);

        (yield element.getGState()).setFillColorWithColorPt(yield PDFNet.ColorPt.init(0, 1, 0));
        element = yield eb.createImageFromMatrix(mask, yield PDFNet.Matrix2D.create(200, 0, 0, -200, 40, 380));
        writer.writePlacedElement(element);

        {
          // This sample illustrates Explicit Masking.
          var img = yield PDFNet.Image.createFromURL(doc, (input_url + 'peppers.jpg'));

          // mask is the explicit mask for the primary (base) image
          img.setMask(mask);

          element = yield eb.createImageFromMatrix(img, yield PDFNet.Matrix2D.create(200, 0, 0, -200, 320, 380));
          writer.writePlacedElement(element);
        }

        writer.end(); // save changes to the current page
        doc.pagePushBack(page);

        // Transparency sample ----------------------------------

        // Start a new page -------------------------------------
        page = yield doc.pageCreate();
        // begin writing to this page
        writer.beginOnPage(page);
        // Reset the GState to default
        eb.reset();

        // Write some transparent text at the bottom of the page.
        element = yield eb.createTextBeginWithFont(yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman), 100);

        // Set the text knockout attribute. Text knockout must be set outside of
        // the text group.
        gstate = yield element.getGState();
        gstate.setTextKnockout(false);
        gstate.setBlendMode(PDFNet.GState.BlendMode.e_bl_difference);
        writer.writeElement(element);

        element = yield eb.createNewTextRun('Transparency');
        element.setTextMatrixEntries(1, 0, 0, 1, 30, 30);
        gstate = yield element.getGState();
        gstate.setFillColorSpace(yield PDFNet.ColorSpace.createDeviceCMYK());
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(1, 0, 0, 0));

        gstate.setFillOpacity(0.5);
        writer.writeElement(element);

        // Write the same text on top the old; shifted by 3 points
        element.setTextMatrixEntries(1, 0, 0, 1, 33, 33);
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(0, 1, 0, 0));
        gstate.setFillOpacity(0.5);

        writer.writeElement(element);
        writer.writeElement(yield eb.createTextEnd());

        // Draw three overlapping transparent circles.
        // start constructing the path
        eb.pathBegin();
        eb.moveTo(459.223, 505.646);
        eb.curveTo(459.223, 415.841, 389.85, 343.04, 304.273, 343.04);
        eb.curveTo(218.697, 343.04, 149.324, 415.841, 149.324, 505.646);
        eb.curveTo(149.324, 595.45, 218.697, 668.25, 304.273, 668.25);
        eb.curveTo(389.85, 668.25, 459.223, 595.45, 459.223, 505.646);
        element = yield eb.pathEnd();
        element.setPathFill(true);

        gstate = yield element.getGState();
        gstate.setFillColorSpace(yield PDFNet.ColorSpace.createDeviceRGB());
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(0, 0, 1)); // Blue Circle

        gstate.setBlendMode(PDFNet.GState.BlendMode.e_bl_normal);
        gstate.setFillOpacity(0.5);
        writer.writeElement(element);

        // Translate relative to the Blue Circle
        gstate.setTransform(1, 0, 0, 1, 113, -185);
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(0, 1, 0)); // Green Circle
        gstate.setFillOpacity(0.5);
        writer.writeElement(element);

        // Translate relative to the Green Circle
        gstate.setTransform(1, 0, 0, 1, -220, 0);
        gstate.setFillColorWithColorPt(yield PDFNet.ColorPt.init(1, 0, 0)); // Red Circle
        gstate.setFillOpacity(0.5);
        writer.writeElement(element);

        writer.end(); // save changes to the current page
        doc.pagePushBack(page);

        // End page ------------------------------------

        var docBuffer = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_remove_unused);
        saveBufferAsPDFDoc(docBuffer, 'element_builder.pdf');

        console.log('Done. Result saved in element_builder.pdf...');
      } catch (e) {
        console.log(e);
        ret = 1;
      }
      return ret;
    }


    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=ElementBuilderTest.js