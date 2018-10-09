//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runBookmarkTest = function() {
    function* addIndent(item, str) {
      var ident = (yield item.getIndent()) - 1;
      for (var i = 0; i < ident; ++i) {
        str += '  ';
        // note: must manually set IndentString to empty after this function is called.
      }
      return str;
    }

    function* printOutlineTree(item) {
      for (; item != null; item = yield item.getNext()) {
        var IndentString = '';
        var ActionString = '';
        var TitleString = '';

        IndentString = yield* addIndent(item, IndentString);
        TitleString = yield item.getTitle();

        ActionString = (IndentString + (yield item.isOpen()) ? '- ' : '+ ') + TitleString + ' Action -> ';

        var action = yield item.getAction();
        if (yield action.isValid()) {
          var actionType = yield action.getType();
          if (actionType === PDFNet.Action.Type.e_GoTo) {
            var dest = yield action.getDest();
            if (yield dest.isValid()) {
              var page = yield dest.getPage();
              console.log(ActionString + 'GoTo Page # ' + (yield page.getIndex()));
            }
          } else {
            console.log(ActionString + "Not a 'GoTo' action");
          }
        } else {
          console.log(ActionString + 'NULL');
        }

        if (yield item.hasChildren()) {
          yield* printOutlineTree(yield item.getFirstChild());
        }
      }
    }

    function* main() {
      console.log('Beginning Test');
      var ret = 0;

      // Relative path to the folder containing test files.
      var input_path = '../TestFiles/';

      // The following example illustrates how to create and edit the outline tree
      // using high-level Bookmark methods.

      var doc = yield PDFNet.PDFDoc.createFromURL(input_path + 'numbered.pdf');
      doc.initSecurityHandler();
      doc.lock();
      console.log('PDFNet and PDF document initialized and locked');

      // Lets first create the root bookmark items.
      var red = yield PDFNet.Bookmark.create(doc, 'Red');
      var green = yield PDFNet.Bookmark.create(doc, 'Green');
      var blue = yield PDFNet.Bookmark.create(doc, 'Blue');

      doc.addRootBookmark(red);
      doc.addRootBookmark(green);
      doc.addRootBookmark(blue);

      // You can also add new root bookmarks using Bookmark.addNext("...")
      blue.addNewNext('foo');
      blue.addNewNext('bar');

      // We can now associate new bookmarks with page destinations:

      // The following example creates an 'explicit' destination (see
      // section '8.2.1 Destinations' in PDF Reference for more details)

      var red_iter = yield doc.getPageIterator(1);

      var red_currpage = yield red_iter.current();
      // eslint-disable-next-line no-unused-vars
      var red_currpageActual = yield doc.getPage(1);
      var red_dest = yield PDFNet.Destination.createFit(red_currpage);
      red.setAction(yield PDFNet.Action.createGoto(red_dest));

      // Create an explicit destination to the first green page in the document
      var tenthPage = yield doc.getPage(10);
      var green_dest = yield PDFNet.Destination.createFit(tenthPage);
      green.setAction(yield PDFNet.Action.createGoto(green_dest));

      // The following example creates a 'named' destination (see
      // section '8.2.1 Destinations' in PDF Reference for more details)
      // Named destinations have certain advantages over explicit destinations.
      var key = 'blue1';
      var nineteenthPage = yield doc.getPage(19);
      var blue_dest = yield PDFNet.Destination.createFit(nineteenthPage);
      var blue_action = yield PDFNet.Action.createGotoWithKey(key, blue_dest); // TODO FIND FIX

      blue.setAction(blue_action);

      // We can now add children Bookmarks sub_red1 instanceof Promise
      var sub_red1 = yield red.addNewChild('Red - Page 1');
      sub_red1.setAction(yield PDFNet.Action.createGoto(yield PDFNet.Destination.createFit(yield doc.getPage(1))));
      var sub_red2 = yield red.addNewChild('Red - Page 2');
      sub_red2.setAction(yield PDFNet.Action.createGoto(yield PDFNet.Destination.createFit(yield doc.getPage(2))));
      var sub_red3 = yield red.addNewChild('Red - Page 3');
      sub_red3.setAction(yield PDFNet.Action.createGoto(yield PDFNet.Destination.createFit(yield doc.getPage(3))));
      var sub_red4 = yield sub_red3.addNewChild('Red - Page 4');
      sub_red4.setAction(yield PDFNet.Action.createGoto(yield PDFNet.Destination.createFit(yield doc.getPage(4))));
      var sub_red5 = yield sub_red3.addNewChild('Red - Page 5');
      sub_red5.setAction(yield PDFNet.Action.createGoto(yield PDFNet.Destination.createFit(yield doc.getPage(5))));
      var sub_red6 = yield sub_red3.addNewChild('Red - Page 6');
      sub_red6.setAction(yield PDFNet.Action.createGoto(yield PDFNet.Destination.createFit(yield doc.getPage(6))));

      // Example of how to find and delete a bookmark by title text.
      var firstbookmark = yield doc.getFirstBookmark();
      var foo = yield firstbookmark.find('foo');
      if (yield foo.isValid()) {
        foo.delete();
      } else {
        console.log('Bookmark foo is invalid');
      }
      var bar = yield firstbookmark.find('bar');
      if (yield bar.isValid()) {
        bar.delete();
      } else {
        console.log('Bookmark bar is invalid');
      }

      // Adding color to Bookmarks. Color and other formatting can help readers
      // get around more easily in large PDF documents.
      red.setColor(1, 0, 0);
      green.setColor(0, 1, 0);
      green.setFlags(2); // set bold font
      blue.setColor(0, 0, 1);
      blue.setFlags(3); // set bold and italic

      var bookmarkBuffer = yield doc.saveMemoryBuffer(0);
      saveBufferAsPDFDoc(bookmarkBuffer, 'bookmark.pdf');

      // The following example illustrates how to traverse the outline tree using
      // Bookmark navigation methods: Bookmark.getNext(), Bookmark.getPrev(),
      // Bookmark.getFirstChild () and Bookmark.getLastChild ().

      // Open the document that was saved in the previous code sample
      var docOut = yield PDFNet.PDFDoc.createFromBuffer(bookmarkBuffer);
      docOut.initSecurityHandler();
      docOut.lock();

      var root = yield docOut.getFirstBookmark();
      yield* printOutlineTree(root);

      console.log('Done.');

      // The following example illustrates how to create a Bookmark to a page
      // in a remote document. A remote go-to action is similar to an ordinary
      // go-to action, but jumps to a destination in another PDF file instead
      // of the current file. See Section 8.5.3 'Remote Go-To Actions' in PDF
      // Reference Manual for details.

      // Use the document from the previous sample. The sample is done this way
      // since we cannot guarantee that bookmarkBuffer is still valid since it
      // may have been sent using transfers to the worker
      var doc = docOut;

      doc.initSecurityHandler();

      // Create file specification (the file referred to by the remote bookmark)
      var file_spec = yield doc.createIndirectDict();
      file_spec.putName('Type', 'Filespec');
      file_spec.putString('F', 'bookmark.pdf');
      var spec = yield PDFNet.FileSpec.createFromObj(file_spec);
      var goto_remote = yield PDFNet.Action.createGotoRemoteSetNewWindow(spec, 5, true);

      var remoteBookmark1 = yield PDFNet.Bookmark.create(doc, 'REMOTE BOOKMARK 1');
      remoteBookmark1.setAction(goto_remote);
      doc.addRootBookmark(remoteBookmark1);

      // Create another remote bookmark, but this time using the low-level SDF/Cos API.
      // Create a remote action
      var remoteBookmark2 = yield PDFNet.Bookmark.create(doc, 'REMOTE BOOKMARK 2');
      doc.addRootBookmark(remoteBookmark2);

      var gotoR = yield (yield remoteBookmark2.getSDFObj()).putDict('A');
      {
        gotoR.putName('S', 'GoToR'); // Set action type
        gotoR.putBool('NewWindow', true);

        // Set the file specification
        gotoR.put('F', file_spec);

        // jump to the first page. Note that pages are indexed from 0.
        var dest = yield gotoR.putArray('D');
        dest.pushBackNumber(9);
        dest.pushBackName('Fit');
      }

      var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_remove_unused);
      saveBufferAsPDFDoc(docbuf, 'bookmark_remote.pdf');

      console.log('Done.');
      return ret;
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=BookmarkTest.js