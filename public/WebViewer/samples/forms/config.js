/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */

(function() {
  //= ========================================================
  // Hide a UI component through ReaderControl.config
  //= ========================================================
  $.extend(ReaderControl.config, {
    customScript: 'defaultScriptExtension.js',
    ui: {
      // in this sample we hide the annotation panel, while still enabling annotation for Form support
      hideAnnotationPanel: true
    }
  });
})();