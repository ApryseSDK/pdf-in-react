/* global Modernizr */
(function() {
  $(document).on('viewerLoaded', function() {
    if (!Modernizr.filereader) {
      return;
    }

    var addImageButton;
    var borderStyle = '1px solid red';

    if ($.mobile) {
      var defaultMenuContext = $('#defaultMenuContext');

      addImageButton = $('<a data-transition="none" class="mobile-button"><span class="glyphicons picture"></span></a>');

      defaultMenuContext.prepend(addImageButton).controlgroup();
    } else {
      var rightAlignedElements = $('#control .right-aligned');
      var customGroup = $('<div class="group"></div>');
      rightAlignedElements.prepend(customGroup);

      addImageButton = $('<span class="glyphicons picture"></span>');

      customGroup.append(addImageButton);
    }

    addImageButton.css('border', borderStyle);
    addImageButton.on('click', function() {
      readerControl.setToolMode('AnnotationCreateStamp');
    });

    readerControl.docViewer.on('toolModeUpdated', function(e, tool) {
      if (tool instanceof Tools.StampCreateTool) {
        addImageButton.addClass('active');
      } else {
        addImageButton.removeClass('active');
      }
    });
  });

  $(document).on('documentLoaded', function() {
    var annotManager = readerControl.docViewer.getAnnotationManager();

    var stampAnnot = new Annotations.StampAnnotation();
    stampAnnot.PageNumber = 1;
    stampAnnot.X = 100;
    stampAnnot.Y = 150;
    stampAnnot.Width = 90;
    stampAnnot.Height = 90;
    stampAnnot.Author = annotManager.getCurrentUser();
    stampAnnot.ImageData = 'data:image/png;base64,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';

    annotManager.addAnnotation(stampAnnot);
    // select will draw the annotation for us so we don't need to call drawAnnotations explicitly
    annotManager.selectAnnotation(stampAnnot);
  });
})();