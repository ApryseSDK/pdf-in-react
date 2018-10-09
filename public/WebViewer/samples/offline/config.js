/* global Modernizr */
(function() {
  Modernizr.on('indexeddb', function(result) {
    if (!(result || Modernizr.websqldatabase)) {
      alert('This browser does not support offline mode!');
    }
  });
})();