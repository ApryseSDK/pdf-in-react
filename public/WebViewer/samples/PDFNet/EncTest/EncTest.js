//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2014 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
(function(exports) {
  'use strict';

  exports.runEncTest = function() {
    function* main() {
      console.log('Beginning Test');
      var ret = 0;
      // Relative path to the folder containing test files.
      var input_url = '../TestFiles/';

      // Example 1:
      // secure a PDF document with password protection and adjust permissions
      try {
        console.log('Running Sample 1');
        // eslint-disable-next-line no-unused-vars
        var islocked = false;
        var doc = yield PDFNet.PDFDoc.createFromURL(input_url + 'fish.pdf');
        doc.initSecurityHandler();
        doc.lock();
        islocked = true;
        console.log('PDFNet and PDF document initialized and locked');

        var performOperation = true; // optional parameter

        // Perform some operation on the document. In this case we use low level SDF API
        // to replace the content stream of the first page with contents of file 'my_stream.txt'
        // Results in fish.pdf becoming a pair of feathers.
        if (performOperation) {
          console.log('Replacing the content stream, use Flate compression...');
          // Get the page dictionary using the following path: trailer/Root/Pages/Kids/0
          var page_trailer = yield doc.getTrailer();
          var page_root = yield page_trailer.get('Root');
          var page_root_value = yield page_root.value();
          var pages = yield page_root_value.get('Pages');
          var pages_val = yield pages.value();
          var kids = yield pages_val.get('Kids');
          var kids_val = yield kids.value();
          var page_dict = yield kids_val.getAt(0);

          var embed_file = yield PDFNet.Filter.createURLFilter(input_url + 'my_stream.txt');
          var mystm = yield PDFNet.FilterReader.create(embed_file);

          var emptyFilter = new PDFNet.Filter('0');
          var flateEncode = yield PDFNet.Filter.createFlateEncode(emptyFilter);

          var indStream = yield doc.createIndirectStreamFromFilter(mystm, flateEncode);
          yield page_dict.put('Contents', indStream);
        }

        // Encrypt the document
        // Apply a new security handler with given security settings.
        // In order to open saved PDF you will need a user password 'test'.
        var new_handler = yield PDFNet.SecurityHandler.createDefault();

        // Set a new password required to open a document
        new_handler.changeUserPasswordUString('test');
        console.log("Setting password to 'test'");

        // Set Permissions
        new_handler.setPermission(PDFNet.SecurityHandler.Permission.e_print, false);
        new_handler.setPermission(PDFNet.SecurityHandler.Permission.e_extract_content, true);

        // Note: document takes the ownership of new_handler.
        doc.setSecurityHandler(new_handler);

        // Save the changes
        console.log('Saving modified file...');

        var docbuf = yield doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'secured.pdf');
      } catch (err) {
        console.log(err);
        console.log(err.stack);
        ret = 1;
      }

      // Example 2:
      // Opens an encrypted PDF document and removes its security.
      try {
        console.log('Running Sample 2');
        var islocked = false;
        var securedDoc = doc;

        if (!(yield securedDoc.initSecurityHandler())) {
          var success = false;
          console.log("The password has been set to : 'test'");
          var passwordsToTry = ['password', 'testy', 'test'];

          for (var count = 0; count < passwordsToTry.length; count++) {
            var candidate = passwordsToTry[count];
            console.log("Trying password candidate: '" + candidate + "'");
            if ((yield securedDoc.initStdSecurityHandlerUString(candidate))) {
              success = true;
              console.log('The password is correct');
              break;
            } else {
              console.log('The password is incorrect.');
            }
          }
          if (!success) {
            console.log('Document authentication error...');
            ret = 1;
            return ret;
          }
        }
        securedDoc.lock();
        islocked = true;
        console.log('PDF document initialized and locked');
        var hdlr = yield securedDoc.getSecurityHandler();

        console.log('Document Open Password: ' + (yield hdlr.isUserPasswordRequired()));
        console.log('Permissions Password: ' + (yield hdlr.isMasterPasswordRequired()));
        console.log('Permissions: ');
        console.log("\tHas 'owner' permissions: " + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_owner)));

        console.log('\tOpen and decrypt the document: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_doc_open)));
        console.log('\tAllow content extraction: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_extract_content)));
        console.log('\tAllow full document editing: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_doc_modify)));
        console.log('\tAllow printing: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_print)));
        console.log('\tAllow high resolution printing: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_print_high)));
        console.log('\tAllow annotation editing: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_mod_annot)));
        console.log('\tAllow form fill: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_fill_forms)));
        console.log('\tAllow content extraction for accessibility: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_access_support)));
        console.log('\tAllow document assembly: ' + (yield hdlr.getPermission(PDFNet.SecurityHandler.Permission.e_assemble_doc)));

        // remove all security on the document
        securedDoc.removeSecurity();

        var docbuf = yield securedDoc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        saveBufferAsPDFDoc(docbuf, 'not_secured.pdf');
        console.log('done');
      } catch (err) {
        console.log(err.stack);
        ret = 1;
      }
      return ret;
    }

    // start the generator
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=EncTest.js