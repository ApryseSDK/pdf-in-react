(function() {
  if ($.mobile) {
    $(document).on('viewerLoaded', function() {
      readerControl.reshowMenu();
    });
  }
})();