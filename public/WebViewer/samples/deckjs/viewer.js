$(function() {
  var $document = $(document);

  var pageCount = 0;
  var status = {
    NOT_STARTED: 0,
    STARTED: 1,
    FINISHED: 2
  };
    // used to keep track of whether we have loaded the page or not
  var pageStatus = [];
  var canvasIds = {};

  window.CoreControls.setWorkerPath('../../lib/html5');

  var queryParams = window.ControlUtils.getQueryStringMap();
  // get the document location from the query string (eg ?d=/files/myfile.xod)
  var docLocation = queryParams.getString('d');
  if (docLocation === null) {
    return;
  }
  var partRetriever = new window.CoreControls.PartRetrievers.HttpPartRetriever(docLocation, window.CoreControls.PartRetrievers.CacheHinting.CACHE);
  var doc = new window.CoreControls.Document();

  doc.loadAsync(partRetriever, function() {
    $document.trigger('documentLoaded');
  });

  function addSlide(pageIndex) {
    var slide = $('<section>').attr('id', 'page' + pageIndex).addClass('slide');
    slide.append($('<div class="loading">'));
    $('body').append(slide);
  }

  $document.on('documentLoaded', function() {
    var i;
    pageCount = doc.getPageCount();
    for (i = 0; i < pageCount; i++) {
      addSlide(i);
      pageStatus.push(status.NOT_STARTED);
    }

    // initially load the first two pages
    for (i = 0; i < Math.min(pageCount, 2); i++) {
      loadCanvas(i);
    }

    // initialize the deck
    $.deck('.slide');
  });

  $document.on('deck.change', function(event, from, to) {
    // load the previous, current and next pages on a page change
    // note that if they are already loaded they won't be loaded again
    loadCanvas(to - 1);
    loadCanvas(to);
    loadCanvas(to + 1);
  });

  function loadCanvas(pageIndex) {
    if (pageIndex < 0 || pageIndex >= pageCount) {
      return;
    }

    if (pageStatus[pageIndex] === status.NOT_STARTED) {
      pageStatus[pageIndex] = status.STARTED;

      canvasIds[pageIndex] = doc.loadCanvasAsync(pageIndex, 1, 0, function(canvas, pageIndex) {
        pageStatus[pageIndex] = status.FINISHED;

        $(canvas).addClass('canvasPage');

        var pageContainer = $('#page' + pageIndex);
        pageContainer.append(canvas);
        pageContainer.find('.loading').remove();

        // trigger page rescale
        $.deck('enableScale');

        // make sure page is centered for very large page sizes by using a negative margin
        var widthDiff = parseFloat($(canvas).css('width')) - pageContainer.find('.deck-slide-scaler').width();
        if (widthDiff > 0) {
          $(canvas).css('margin-left', (-widthDiff / 2) + 'px');
        }

        // unload the page's resources here since the canvases are only rendered once
        // and the caching isn't necessary
        doc.unloadCanvasResources(canvasIds[pageIndex]);
        delete canvasIds[pageIndex];
      }, function() {}, 1);
    }
  }
});