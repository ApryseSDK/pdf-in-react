(function() {
  function NullFunc() {}

  var parentPage = this.parent.document;
  var showSideWindow = null;
  parentPage.wvCloseDoc = NullFunc;
  // Prevents server url message when implementing custom annotation solution.
  ReaderControl.config.serverURL = null;
  var currentViewer;

  function CloseDoc() {
    var doc = currentViewer.getDocument();
    if (doc) {
      doc.unloadResources();
    }
    showSideWindow = readerControl.getShowSideWindow();
    readerControl.setShowSideWindow(false);
    readerControl.closeDocument();
    readerControl.setShowSideWindow();
    parentPage.wvCloseDoc = NullFunc;
    $('#customclosegroup').remove();
  }

  // onopen
  // $('.topbar').removeClass('hideshare');
  //
  // onclose
  // $('.topbar').addClass('hideshare');
  //
  // onuser
  // var title_element = document.getElementById('user-header');
  // title_element.innerHTML = data.user_name;
  //
  // on clear user
  // var title_element = document.getElementById('user-header');
  // title_element.innerHTML = '';

  $(document).on('documentLoaded', function() {
    if ($('#customclosegroup').length === 0) {
      $('#control .right-aligned').append('<div class="group" id="customclosegroup">'
                + '<span class="glyphicons remove closebutton"  title="Close Document"></span></div>');
      var $closebutton = $('span.closebutton');
      $closebutton.css('padding-right', '1px');
      $closebutton.click(parentPage.trnCloseDoc);
    }

    if (showSideWindow !== null && showSideWindow !== readerControl.getShowSideWindow()) {
      readerControl.setShowSideWindow(showSideWindow);
    }
    currentViewer = readerControl.docViewer;
    parentPage.wvCloseDoc = CloseDoc;

    var annotManager = readerControl.docViewer.getAnnotationManager();

    function hideAnnotations() {
      $('#toggleNotesPanel').parent().hide();
      readerControl.showNotesPanel(false);
      $('#notesPanelWrapper').hide();
      readerControl.setToolMode(window.PDFTron.WebViewer.ToolMode.AnnotationEdit);
      readerControl.setReadOnly(true);
      annotManager.toggleAnnotations();
      $('.annotTool, #overflowTools').hide();
    }

    function showAnnotations() {
      annotManager.toggleAnnotations();
      $('.annotTool, #overflowTools').show();
      $('#toggleNotesPanel').parent().show();
      $('#notesPanelWrapper').show();
      readerControl.setReadOnly(false);
    }
    window.parent.hideAnnotations = hideAnnotations;
    window.parent.showAnnotations = showAnnotations;
  });
  if (parentPage.trn_dragenter_handler) {
    $(document).on('dragenter', parentPage.trn_dragenter_handler);
  }

  $(document).on('viewerLoaded', function() {
    readerControl.userPreferences.showSideWindow = false;
    readerControl.docViewer.on('fitModeUpdated', function(e, fitMode) {
      if (fitMode !== readerControl.docViewer.FitMode.Zoom) {
        readerControl.docViewer.defaults.FitMode = fitMode;
      } else {
        readerControl.docViewer.defaults.FitMode = fitMode;
      }
    });

    readerControl.docViewer.on('zoomUpdated', function(e, zoomLevel) {
      readerControl.docViewer.defaults.Zoom = zoomLevel;
    });

    readerControl.docViewer.on('displayModeUpdated', function() {
      var displayMode = readerControl.docViewer.getDisplayModeManager().getDisplayMode();
      readerControl.docViewer.defaults.DisplayMode = displayMode;
    });
  });
})();
