//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
(function(exports) {
  'use strict';

  exports.runInteractiveFormsTest = function() {
    PDFNet.CheckStyle = {
      e_check: 0,
      e_circle: 1,
      e_cross: 2,
      e_diamond: 3,
      e_square: 4,
      e_star: 5
    };

    function* RenameAllFields(doc, name) {
      var itr = yield doc.getFieldIterator(name);
      for (var counter = 0; (yield itr.hasNext()); itr = (yield doc.getFieldIterator(name)), ++counter) {
        var f = yield itr.current();
        f.rename(name + counter);
      }
    }

    // Note: The visual appearance of check-marks and radio-buttons in PDF documents is
    // not limited to CheckStyle-s. It is possible to create a visual appearance using
    // arbitrary glyph, text, raster image, or path object. Although most PDF producers
    // limit the options to the above 'standard' styles, using PDFNetJS you can generate
    // arbitrary appearances.
    function* CreateCheckmarkAppearance(doc, style) {
      var builder = yield PDFNet.ElementBuilder.create();
      var writer = yield PDFNet.ElementWriter.create();
      writer.begin(doc);
      writer.writeElement((yield builder.createTextBegin()));

      var symbol;
      switch (style) {
        case PDFNet.CheckStyle.e_circle: symbol = '\x6C'; break;
        case PDFNet.CheckStyle.e_diamond: symbol = '\x75'; break;
        case PDFNet.CheckStyle.e_cross: symbol = '\x35'; break;
        case PDFNet.CheckStyle.e_square: symbol = '\x6E'; break;
        case PDFNet.CheckStyle.e_star: symbol = '\x48'; break;
          // ...
          // See section D.4 "ZapfDingbats Set and Encoding" in PDF Reference Manual
          // (http://www.pdftron.com/downloads/PDFReference16.pdf) for the complete
          // graphical map for ZapfDingbats font. Please note that all character codes
          // are represented using the 'octal' notation.
        default: // e_check
          symbol = '\x34';
      }

      var zapfDingbatsFont = yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_zapf_dingbats);
      var checkmark = yield builder.createTextRunWithSize(symbol, 1, zapfDingbatsFont, 1);
      writer.writeElement(checkmark);
      writer.writeElement((yield builder.createTextEnd()));

      var stm = yield writer.end();
      yield stm.putRect('BBox', -0.2, -0.2, 1, 1); // Clip
      yield stm.putName('Subtype', 'Form');
      return stm;
    }

    function* CreateButtonAppearance(doc, button_down) {
      // Create a button appearance stream ------------------------------------

      var builder = yield PDFNet.ElementBuilder.create();
      var writer = yield PDFNet.ElementWriter.create();
      writer.begin(doc);

      // Draw background
      var element = yield builder.createRect(0, 0, 101, 37);
      element.setPathFill(true);
      element.setPathStroke(false);

      var elementGState = yield element.getGState();
      elementGState.setFillColorSpace((yield PDFNet.ColorSpace.createDeviceGray()));
      elementGState.setFillColorWithColorPt((yield PDFNet.ColorPt.init(0.75)));
      writer.writeElement(element);

      // Draw 'Submit' text
      writer.writeElement((yield builder.createTextBegin()));

      var text = 'Submit';
      var HelveticaBoldFont = yield PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_helvetica_bold);
      element = yield builder.createTextRunWithSize(text, text.length, HelveticaBoldFont, 12);
      elementGState = yield element.getGState();
      elementGState.setFillColorWithColorPt((yield PDFNet.ColorPt.init(0)));

      if (button_down) {
        element.setTextMatrixEntries(1, 0, 0, 1, 33, 10);
      } else {
        element.setTextMatrixEntries(1, 0, 0, 1, 30, 13);
      }
      writer.writeElement(element);

      writer.writeElement((yield builder.createTextEnd()));

      var stm = yield writer.end();

      // Set the bounding box
      yield stm.putRect('BBox', 0, 0, 101, 37);
      yield stm.putName('Subtype', 'Form');
      return stm;
    }

    function* main() {
      try {
        console.log('Beginning Test 1');

        // Relative path to the folder containing test files.
        // eslint-disable-next-line no-unused-vars
        var input_path = '../TestFiles/';

        var doc = yield PDFNet.PDFDoc.create();
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDF document initialized and locked');

        var blank_page = yield doc.pageCreate();

        // create new fields
        var emp_first_name = yield doc.fieldCreateFromStrings('employee.name.first', PDFNet.Field.Type.e_text, 'John', '');
        var emp_last_name = yield doc.fieldCreateFromStrings('employee.name.last', PDFNet.Field.Type.e_text, 'Doe', '');
        var emp_last_check1 = yield doc.fieldCreateFromStrings('employee.name.check1', PDFNet.Field.Type.e_check, 'Yes', '');

        var submit = yield doc.fieldCreate('submit', PDFNet.Field.Type.e_button);

        // Create page annotations for the above fields.

        // Create text annotation
        var annot1 = yield PDFNet.WidgetAnnot.create(doc, (yield PDFNet.Rect.init(50, 550, 350, 600)), emp_first_name);
        var annot2 = yield PDFNet.WidgetAnnot.create(doc, (yield PDFNet.Rect.init(50, 450, 350, 500)), emp_last_name);

        // create checkbox annotation
        var annot3 = yield PDFNet.WidgetAnnot.create(doc, (yield PDFNet.Rect.init(64, 356, 120, 410)), emp_last_check1);
        // Set the annotation appearance for the "Yes" state
        // NOTE: if we call refreshFieldAppearances after this the appearance will be discarded
        var checkMarkApp = yield* CreateCheckmarkAppearance(doc, PDFNet.CheckStyle.e_check);
        // Set the annotation appearance for the "Yes" state...
        annot3.setAppearance(checkMarkApp, PDFNet.Annot.State.e_normal, 'Yes');

        // Create button annotation
        var annot4 = yield PDFNet.WidgetAnnot.create(doc, (yield PDFNet.Rect.init(64, 284, 163, 320)), submit);
        // Set the annotation appearances for the down and up state...
        var falseButtonApp = yield* CreateButtonAppearance(doc, false);
        var trueButtonApp = yield* CreateButtonAppearance(doc, true);
        yield annot4.setAppearance(falseButtonApp, PDFNet.Annot.State.e_normal);
        yield annot4.setAppearance(trueButtonApp, PDFNet.Annot.State.e_down);

        // Create 'SubmitForm' action. The action will be linked to the button.
        var url = yield PDFNet.FileSpec.createURL(doc, 'http://www.pdftron.com');
        var button_action = yield PDFNet.Action.createSubmitForm(url);

        // Associate the above action with 'Down' event in annotations action dictionary.
        var annot_action = yield (yield annot4.getSDFObj()).putDict('AA');
        annot_action.put('D', (yield button_action.getSDFObj()));

        blank_page.annotPushBack(annot1); // Add annotations to the page
        blank_page.annotPushBack(annot2);
        blank_page.annotPushBack(annot3);
        blank_page.annotPushBack(annot4);

        doc.pagePushBack(blank_page); // Add the page as the last page in the document.

        // If you are not satisfied with the look of default auto-generated appearance
        // streams you can delete "AP" entry from the Widget annotation and set
        // "NeedAppearances" flag in AcroForm dictionary:
        //    doc.GetAcroForm().PutBool("NeedAppearances", true);
        // This will force the viewer application to auto-generate new appearance streams
        // every time the document is opened.
        //
        // Alternatively you can generate custom annotation appearance using ElementWriter
        // and then set the "AP" entry in the widget dictionary to the new appearance
        // stream.
        //
        // Yet another option is to pre-populate field entries with dummy text. When
        // you edit the field values using PDFNet the new field appearances will match
        // the old ones.

        // doc.GetAcroForm().PutBool("NeedAppearances", true);
        // NOTE: refreshFieldAppearances will replace previously generated appearance streams
        doc.refreshFieldAppearances();

        var docBuffer = yield doc.saveMemoryBuffer(0);
        saveBufferAsPDFDoc(docBuffer, 'forms_test1.pdf');

        console.log('Example 1 complete and everything deallocated.');
      } catch (err) {
        console.log(err.stack);
      }
      //----------------------------------------------------------------------------------
      // Example 2:
      // Fill-in forms / Modify values of existing fields.
      // Traverse all form fields in the document (and print out their names).
      // Search for specific fields in the document.
      //----------------------------------------------------------------------------------

      try {
        console.log('Beginning Test 2');

        var input_path = '../TestFiles/';
        // we use the forms test doc from the previous sample
        // Buffers passed into PDFNetJS functions are made invalid afterwards due to the functions taking ownership.
        // If you are using the same buffer to initialize multiple documents, pass in a copy of the buffer.
        var copyOfBuffer = new Uint8Array(docBuffer.buffer.slice(0));
        var doc2 = yield PDFNet.PDFDoc.createFromBuffer(copyOfBuffer);

        doc2.initSecurityHandler();
        doc2.lock();
        console.log('Sample 2 PDF document initialized and locked');
        var itr = yield doc2.getFieldIteratorBegin();

        for (; (yield itr.hasNext()); itr.next()) {
          var currentItr = yield itr.current();
          console.log('Field name: ' + (yield currentItr.getName()));
          console.log('Field partial name: ' + (yield currentItr.getPartialName()));

          console.log('Field type: ');
          var type = yield currentItr.getType();
          var str_val = yield currentItr.getValueAsString();

          switch (type) {
            case PDFNet.Field.Type.e_button:
            {
              console.log('Button');
              break;
            }
            case PDFNet.Field.Type.e_radio:
            {
              console.log('Radio button: Value = ' + str_val);
              break;
            }
            case PDFNet.Field.Type.e_check:
            {
              var currItr = yield itr.current();
              currItr.setValueAsBool(true);
              console.log('Check box: Value = ' + str_val);
              break;
            }
            case PDFNet.Field.Type.e_text:
            {
              console.log('Text');
              // Edit all variable text in the document
              var currItr = yield itr.current();
              currItr.setValueAsString('This is a new value. The old one was: ' + str_val);
              break;
            }
            case PDFNet.Field.Type.e_choice:
            {
              console.log('Choice');
              break;
            }
            case PDFNet.Field.Type.e_signature:
            {
              console.log('Signature');
              break;
            }
          }
          console.log('-----------------------');
        }
        var f = yield doc2.getField('employee.name.first');
        if (f) {
          console.log('Field search for ' + (yield f.getName()) + ' was successful');
        } else {
          console.log('Field search failed');
        }
        // Regenerate field appearances.
        doc2.refreshFieldAppearances();

        var docBuffer = yield doc2.saveMemoryBuffer(0);
        saveBufferAsPDFDoc(docBuffer, 'forms_test_edit.pdf');
        console.log('Example 2 complete and everything deallocated.');
      } catch (err) {
        console.log(err);
      }
      //----------------------------------------------------------------------------------
      // Sample 3: Form templating
      // Replicate pages and form data within a document. Then rename field names to make
      // them unique.
      //----------------------------------------------------------------------------------
      try {
        // we still keep using our original forms test doc.
        // If you are using the same buffer to initialize multiple documents, pass in a copy of the buffer.
        var copyOfBuffer = new Uint8Array(docBuffer.buffer.slice(0));
        var doc3 = yield PDFNet.PDFDoc.createFromBuffer(copyOfBuffer);
        doc3.initSecurityHandler();
        doc3.lock();
        console.log('Sample 3 PDF document initialized and locked');
        var src_page = yield doc3.getPage(1);
        doc3.pagePushBack(src_page); // Append several copies of the first page
        doc3.pagePushBack(src_page); // Note that forms are successfully copied
        doc3.pagePushBack(src_page);
        doc3.pagePushBack(src_page);

        // Now we rename fields in order to make every field unique.
        // You can use this technique for dynamic template filling where you have a 'master'
        // form page that should be replicated, but with unique field names on every page.
        yield* RenameAllFields(doc3, 'employee.name.first');
        yield* RenameAllFields(doc3, 'employee.name.last');
        yield* RenameAllFields(doc3, 'employee.name.check1');
        yield* RenameAllFields(doc3, 'submit');

        var docBuffer = yield doc3.saveMemoryBuffer(0);
        saveBufferAsPDFDoc(docBuffer, 'forms_test1_cloned.pdf');
        console.log('Example 3 complete and everything deallocated.');
      } catch (err) {
        console.log(err);
      }

      //----------------------------------------------------------------------------------
      // Sample:
      // Flatten all form fields in a document.
      // Note that this sample is intended to show that it is possible to flatten
      // individual fields. PDFNet provides a utility function PDFDoc.FlattenAnnotations()
      // that will automatically flatten all fields.
      //----------------------------------------------------------------------------------

      try {
        var copyOfBuffer = new Uint8Array(docBuffer.buffer.slice(0));
        var doc4 = yield PDFNet.PDFDoc.createFromBuffer(copyOfBuffer);
        doc4.initSecurityHandler();
        doc4.lock();
        console.log('Sample 4 PDF document initialized and locked');

        // Flatten all pages
        // eslint-disable-next-line no-constant-condition
        if (true) {
          doc4.flattenAnnotations();
        } else {
          // Manual flattening
          for (var pitr = yield doc4.getPageIterator(); (yield pitr.hasNext()); (yield pitr.next())) {
            var page = yield pitr.current();
            var annots = yield page.getAnnots();

            if (annots) { // Look for all widget annotations (in reverse order)
              for (var i = parseInt(yield annots.size(), 10) - 1; i >= 0; --i) {
                var annotObj = yield annots.getAt(i);
                var annotObjSubtype = yield annotObj.get('Subtype');
                // eslint-disable-next-line no-unused-vars
                var annotObjVal = yield annotObjSubtype.value();
                var annotObjName = yield (yield (yield annotObj.get('Subtype')).value()).getName();

                if (annotObjName === 'Widget') {
                  var field = yield PDFNet.Field.create(annotObj);
                  field.flatten(page);

                  // Another way of making a read only field is by modifying
                  // field's e_read_only flag:
                  //    field.SetFlag(Field::e_read_only, true);
                }
              }
            }
          }
        }

        var docBuffer = yield doc4.saveMemoryBuffer(0);
        saveBufferAsPDFDoc(docBuffer, 'forms_test1_flattened.pdf');
        console.log('done - Example 4 complete and everything deallocated.');
      } catch (err) {
        console.log(err);
      }
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=InteractiveFormsTest.js