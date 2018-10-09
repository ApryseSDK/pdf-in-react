//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runTextExtractTest = function() {
    // A utility method used to dump all text content in the console window.
    function* dumpAllText(reader) {
      var element;
      while ((element = yield reader.next()) !== null) {
        switch (yield element.getType()) {
          case PDFNet.Element.Type.e_text_begin:
            console.log('--> Text Block Begin');
            break;
          case PDFNet.Element.Type.e_text_end:
            console.log('--> Text Block End');
            break;
          case PDFNet.Element.Type.e_text:
            var bbox = yield element.getBBox();
            console.log('--> BBox: ' + bbox.x1 + ', ' + bbox.y1 + ', ' + bbox.x2 + ', ' + bbox.y2 + '\n');
            var arr = yield element.getTextString();
            console.log(arr);
            break;
          case PDFNet.Element.Type.e_text_new_line:
            break;
          case PDFNet.Element.Type.e_form:
            reader.formBegin();
            yield* dumpAllText(reader);
            reader.end();
            break;
        }
      }
    }

    // helper method for ReadTextFromRect
    function* rectTextSearch(reader, pos, srch_str) {
      var element;
      while ((element = yield reader.next()) !== null) {
        switch (yield element.getType()) {
          case PDFNet.Element.Type.e_text:
            var bbox = yield element.getBBox();
            if (yield bbox.intersectRect(bbox, pos)) {
              var arr = yield element.getTextString();
              srch_str += arr + '\n';
            }
            break;
          case PDFNet.Element.Type.e_text_new_line:
            break;
          case PDFNet.Element.Type.e_form:
            reader.formBegin();
            srch_str += yield* rectTextSearch(reader, pos, srch_str); // possibly need srch_str = ...
            reader.end();
            break;
        }
      }
      return srch_str;
    }

    function* readTextFromRect(page, pos, reader) {
      var srch_str = '';
      reader.beginOnPage(page); // uses default parameters.
      srch_str += yield* rectTextSearch(reader, pos, srch_str);
      reader.end();
      return srch_str;
    }

    function* printStyle(s) {
      var rgb = yield s.getColor();
      var rColorVal = yield rgb.get(0);
      var gColorVal = yield rgb.get(1);
      var bColorVal = yield rgb.get(2);
      var fontName = yield s.getFontName();
      var fontSize = yield s.getFontSize();
      var serifOutput = ((yield s.isSerif()) ? ' sans-serif; ' : ' ');
      var returnString = 'style="font-family:' + fontName + ';font-size:' + fontSize + ';' + serifOutput + 'color: #' + rColorVal.toString(16) + ', ' + gColorVal.toString(16) + ', ' + bColorVal.toString(16) + ')"';
      return returnString;
    }

    function* main() {
      console.log('Beginning Test');

      // eslint-disable-next-line no-unused-vars
      var ret = 0;
      yield PDFNet.initialize(); // need to yield since it initializes the worker

      // Relative path to the folder containing test files.
      var input_url = '../TestFiles/';
      var input_filename = 'newsletter.pdf'; // addimage.pdf, newsletter.pdf

      var example1_basic = false;
      var example2_xml = false;
      var example3_wordlist = false;
      var example4_advanced = true;
      var example5_low_level = false;

      try {
        yield PDFNet.startDeallocateStack();
        var doc = yield PDFNet.PDFDoc.createFromURL(input_url + input_filename);
        doc.initSecurityHandler();
        doc.lock();

        var page = yield doc.getPage(1);

        if (page.id === '0') {
          console.log('Page not found.');
          return 1;
        }

        var txt = yield PDFNet.TextExtractor.create();
        var rect = new PDFNet.Rect(0, 0, 612, 794);
        txt.begin(page, rect);
        // var element = yield readertest.next();
        // var eltype = yield element.getType();

        // eslint-disable-next-line no-unused-vars
        var count = yield txt.getNumLines();
        var text, line, word;

        if (example1_basic) {
          var wordCount = yield txt.getWordCount();
          console.log('Word Count: ' + wordCount);
          text = yield txt.getAsText();
          console.log('- GetAsText  -------------------------------');
          console.log(text);
          console.log('-----------------------------------------');
        }

        if (example2_xml) {
          text = yield txt.getAsXML(PDFNet.TextExtractor.XMLOutputFlags.e_words_as_elements | PDFNet.TextExtractor.XMLOutputFlags.e_output_bbox | PDFNet.TextExtractor.XMLOutputFlags.e_output_style_info);
          console.log('- GetAsXML  --------------------------' + text);
          console.log('-----------------------------------------------------------');
        }

        if (example3_wordlist) {
          line = yield txt.getFirstLine();
          for (; (yield line.isValid()); line = (yield line.getNextLine())) {
            for (word = yield line.getFirstWord(); (yield word.isValid()); word = (yield word.getNextWord())) {
              text = yield word.getString();
              console.log(text);
            }
          }
          console.log('-----------------------------------------------------------');
        }

        if (example4_advanced) {
          var b;
          var q;
          var cur_flow_id = -1;
          var cur_para_id = -1;

          /* eslint-disable no-unused-vars */
          var builder = yield PDFNet.ElementBuilder.create(); // ElementBuilder, used to build new element Objects
          var writer = yield PDFNet.ElementWriter.create(); // ElementWriter, used to write elements to the page
          /* eslint-enable no-unused-vars */

          for (line = yield txt.getFirstLine(); yield line.isValid(); line = yield line.getNextLine()) {
            if ((yield line.getNumWords()) === 0) {
              continue;
            }
            if ((yield line.getFlowID()) !== cur_flow_id) {
              if (cur_flow_id !== -1) {
                if (cur_para_id !== -1) {
                  cur_para_id = -1;
                  console.log('</Para>');
                }
                console.log('</Flow>');
              }
              cur_flow_id = yield line.getFlowID();
              console.log('<Flow id="' + cur_flow_id + '">');
            }
            if ((yield line.getParagraphID()) !== cur_para_id) {
              if (cur_para_id !== -1) {
                console.log('</Para>');
              }
              cur_para_id = yield line.getParagraphID();
              console.log('<Para id="' + cur_para_id + '">');
            }
            b = yield line.getBBox();
            var line_style = yield line.getStyle();
            var outputStringLineBox = '<Line box="' + b.x1 + ', ' + b.y1 + ', ' + b.x2 + ', ' + b.y1 + '">';
            outputStringLineBox += (yield* printStyle(line_style));
            var currentLineNum = yield line.getCurrentNum();
            outputStringLineBox += ' cur_num="' + currentLineNum + '">';
            console.log(outputStringLineBox);

            // For each word in the line...
            var outputStringWord = '';
            for (word = yield line.getFirstWord(); yield word.isValid(); word = yield word.getNextWord()) {
              // output bounding box for the word
              q = yield word.getBBox();
              var currentNum = yield word.getCurrentNum();
              outputStringWord += '<Word box="' + q.x1 + ', ' + q.y1 + ', ' + q.x2 + ', ' + q.y2 + '" cur_num="' + currentNum + '"';
              var sz = yield word.getStringLen();
              if (sz === 0) {
                continue;
              }
              // if the word style is different from the parent style, output the new style
              var sty = yield word.getStyle();
              if (!(yield sty.compare(line_style))) {
                console.log((yield* printStyle(sty)));
              }
              outputStringWord += '>' + (yield word.getString()) + '</Word>';
              console.log(outputStringWord);
            }
            console.log('</Line>');
          }
          if (cur_flow_id !== -1) {
            if (cur_para_id !== -1) {
              cur_para_id = -1;
              console.log('</Para>');
            }
            console.log('</Flow>\n');
          }
        }
        console.log('done');
        yield PDFNet.endDeallocateStack();
      } catch (err) {
        console.log(err);
        console.log(err.stack);
        ret = 1;
      }


      if (example5_low_level) {
        ret = 0;
        try {
          yield PDFNet.startDeallocateStack();
          doc = yield PDFNet.PDFDoc.createFromURL(input_url + input_filename);
          doc.initSecurityHandler();
          doc.lock();

          // Example 1. Extract all text content from the document
          var reader = yield PDFNet.ElementReader.create();
          var itr = yield doc.getPageIterator(1);

          //  Read every page
          for (itr; yield itr.hasNext(); itr.next()) {
            page = yield itr.current();
            reader.beginOnPage(page);
            yield* dumpAllText(reader);
            reader.end();
          }
          // Example 2. Extract text content based on the
          // selection rectangle.
          console.log('----------------------------------------------------');
          console.log('Extract text based on the selection rectangle.');
          console.log('----------------------------------------------------');


          var first_page = yield (yield doc.getPageIterator()).current();
          var s1 = yield* readTextFromRect(first_page, (yield PDFNet.Rect.init(27, 392, 563, 534)), reader);
          console.log('Field 1: ' + s1);

          s1 = yield* readTextFromRect(first_page, (yield PDFNet.Rect.init(28, 551, 106, 623)), reader);
          console.log('Field 2: ' + s1);

          s1 = yield* readTextFromRect(first_page, (yield PDFNet.Rect.init(208, 550, 387, 621)), reader);
          console.log('Field 3: ' + s1);

          // ...
          console.log('Done');
          yield PDFNet.endDeallocateStack();
        } catch (err) {
          console.log(err.stack);
          ret = 1;
        }
      }
    }
    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=TextExtractTest.js