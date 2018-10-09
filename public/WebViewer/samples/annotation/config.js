/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */

(function() {
  //= ========================================================
  // Load a custom script for the "about" page
  //= ========================================================
  $.extend(ReaderControl.config, {
    customScript: 'defaultScriptExtension.js'
  });

  $(document).on('documentLoaded', function() {
    // set annotation tab visible by default
    readerControl.setToolMode(window.PDFTron.WebViewer.ToolMode.AnnotationCreateFreeHand);
    if ($.mobile) {
      readerControl.annotMode = true;
    }
  });
})();