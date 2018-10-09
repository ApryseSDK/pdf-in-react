//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------

(function(exports) {
  'use strict';

  exports.runDigitalSignatureTest = function() {
    function* SignPDF() {
      var infile = '../TestFiles/doc_to_sign.pdf';
      var certfile = '../TestFiles/pdftron.pfx';
      var imagefile = '../TestFiles/signature.jpg';

      var result = true;
      try {
        console.log('Signing PDF document: ');
        var doc = yield PDFNet.PDFDoc.createFromURL(infile);
        doc.initSecurityHandler();
        doc.lock();
        console.log('PDFNet and PDF document initialized and locked');

        var sigHandlerId = yield doc.addStdSignatureHandlerFromURL(certfile, 'password');

        // Obtain the signature form field from the PDFDoc via Annotation.
        var sigField = yield doc.getField('Signature1');
        var widgetAnnot = yield PDFNet.WidgetAnnot.createFromObj((yield sigField.getSDFObj()));

        // Tell PDFNetC to use the SignatureHandler created to sign the new signature form field.
        var sigDict = yield sigField.useSignatureHandler(sigHandlerId);

        // Add more information to the signature dictionary.
        // sigDict.PutName("SubFilter", "adbe.pkcs7.detached");
        yield sigDict.putString('Name', 'PDFTron');
        yield sigDict.putString('Location', 'Vancouver, BC');
        yield sigDict.putString('Reason', 'Document verification.');

        // Add the signature appearance.
        var apWriter = yield PDFNet.ElementWriter.create();
        var apBuilder = yield PDFNet.ElementBuilder.create();

        apWriter.begin(doc);

        var sigImg = yield PDFNet.Image.createFromURL(doc, imagefile);
        var w = yield sigImg.getImageWidth();
        var h = yield sigImg.getImageHeight();
        var apElement = yield apBuilder.createImageScaled(sigImg, 0, 0, w, h);
        apWriter.writePlacedElement(apElement);
        var apObj = yield apWriter.end();
        apObj.putRect('BBox', 0, 0, w, h);
        apObj.putName('Subtype', 'Form');
        apObj.putName('Type', 'XObject');
        apWriter.begin(doc);
        apElement = yield apBuilder.createFormFromStream(apObj);
        apWriter.writePlacedElement(apElement);
        apObj = yield apWriter.end();
        apObj.putRect('BBox', 0, 0, w, h);
        apObj.putName('Subtype', 'Form');
        apObj.putName('Type', 'XObject');

        yield widgetAnnot.setAppearance(apObj);
        yield widgetAnnot.refreshAppearance();

        var docbuf = yield doc.saveMemoryBuffer(0);
        saveBufferAsPDFDoc(docbuf, 'signed_doc.pdf');

        console.log('Finished signing PDF document');
      } catch (err) {
        console.log(err);
      }
      return result;
    }

    function* CertifyPDF() {
      var infile = '../TestFiles/newsletter.pdf';
      var certfile = '../TestFiles/pdftron.pfx';
      var result = true;
      try {
        console.log('Certifying PDF document: "' + infile + '"');
        // Open existing PDF document.
        var doc = yield PDFNet.PDFDoc.createFromURL(infile);
        doc.initSecurityHandler();
        doc.lock();
        // Add an StdSignatureHandler instance to PDFDoc, making sure to keep track of it using the ID returned.
        var sigHandlerId = yield doc.addStdSignatureHandlerFromURL(certfile, 'password');
        // When using OpenSSLSignatureHandler class, uncomment the following lines and comment the line above.
        // Create a new instance of the SignatureHandler.
        // OpenSSLSignatureHandler sigHandler(certfile.ConvertToUtf8().c_str(), "password");
        // Add the SignatureHandler instance to PDFDoc, making sure to keep track of it using the ID returned.
        // SDF::SignatureHandlerId sigHandlerId = doc.AddSignatureHandler(sigHandler);

        // Create new signature form field in the PDFDoc.
        var sigField = yield doc.fieldCreate('Signature1', PDFNet.Field.Type.e_signature);

        var page1 = yield doc.getPage(1);
        var widgetAnnot = yield PDFNet.WidgetAnnot.create((yield doc.getSDFDoc()), (yield PDFNet.Rect.init(0, 0, 0, 0)), sigField);
        page1.annotPushBack(widgetAnnot);
        widgetAnnot.setPage(page1);
        var widgetObj = yield widgetAnnot.getSDFObj();
        widgetObj.putNumber('F', 132);
        widgetObj.putName('Type', 'Annot');

        // Tell PDFNetC to use the SignatureHandler created to sign the new signature form field.
        var sigDict = yield sigField.useSignatureHandler(sigHandlerId);

        // Add more information to the signature dictionary.
        sigDict.putName('SubFilter', 'adbe.pkcs7,detached');
        sigDict.putString('Name', 'PDFTron');
        sigDict.putString('Location', 'Vancouver, BC');
        sigDict.putString('Reason', 'Document verification');

        // Appearance can be added to the widget annotation. Please see the "SignPDF()" function for details.

        // Add this sigDict as DocMDP in Perms dictionary from root
        var root = yield doc.getRoot();
        var perms = yield root.putDict('Perms');
        // add the sigDict as DocMDP (indirect) in Perms
        perms.put('DocMDP', sigDict);

        // add the additional DocMDP transform params
        var refObj = yield sigDict.putArray('Reference');
        var transform = yield refObj.pushBackDict();
        transform.putName('TransformMethod', 'DocMDP');
        transform.putName('Type', 'SigRef');
        var transformParams = yield transform.putDict('TransformParams');
        transformParams.putNumber('P', 1); // Set permissions as necessary.
        transformParams.putName('Type', 'TransformParams');
        transformParams.putName('V', '1.2');

        var docbuf = yield doc.saveMemoryBuffer(0);
        saveBufferAsPDFDoc(docbuf, 'newsletter_certified.pdf');

        console.log('Finished certifying PDF document.');
      } catch (err) {
        console.log(err);
      }
      return result;
    }

    function* main() {
      console.log('Beginning Test');
      var result = true;

      if (!(yield* SignPDF())) {
        result = false;
      }

      if (!(yield* CertifyPDF())) {
        result = false;
      }

      if (!result) {
        console.log('Tests Failed');
      } else {
        console.log('Done. All Tests Passed');
      }
    }
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL); // replace with your own license key and remove the samples-key.js script tag
  };
})(window);
// eslint-disable-next-line spaced-comment
//# sourceURL=DigitalSignatureTest.js