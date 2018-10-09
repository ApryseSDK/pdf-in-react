(function(exports) {
  'use strict';

  exports.CoreControls.setWorkerPath('../../lib/html5');

  var ReaderControl = function() {
    this.initUi();
    this.initViewer();
  };

  ReaderControl.prototype = {

    initUi: function() {
      // Disables all dragging.
      window.ondragstart = function() {
        return false;
      };

      // Disables all selection.
      window.onload = function() {
        disableSelection(document.body);
      };

      function disableSelection(target) {
        if (typeof target.onselectstart !== 'undefined') { // IE
          target.onselectstart = function() {
            return false;
          };
        } else if (typeof target.style.MozUserSelect !== 'undefined') { // Firefox
          target.style.MozUserSelect = 'none';
        } else { // All other ie: Opera
          target.onmousedown = function() {
            return false;
          };
        }
        target.style.cursor = 'default';
      }
    },

    initViewer: function() {
      var me = this;

      // Set defaults.
      this.docViewer = new exports.CoreControls.DocumentViewer();
      this.currentPageIdx = 0;
      this.direction = 1;
      this.nPages = 0;
      this.doc = null;

      // Element that contains all flipbook pages.
      this.$viewer = $('#viewer');

      // Custom display mode for flipbook.
      me.docViewer.getDisplayModeManager().setDisplayMode(new exports.CoreControls.DisplayMode(me.docViewer, 'Custom'));

      // Remove margins for the flipbook

      me.docViewer.setMargin(0);

      // Set default zoom level.
      this.zoom = 1;
      me.docViewer.zoomTo(this.zoom);

      // Have a resonable cache size for pages and a resonable amount of page pre-rendering.
      exports.CoreControls.SetCachingLevel(6);

      me.displayMode = new exports.CoreControls.DisplayMode(me.docViewer, exports.CoreControls.DisplayModes.Custom);
      // override getVisiblePages so the correct pages are rendered
      $.extend(me.displayMode, {
        getVisiblePages: function() {
          var pageIdx = me.currentPageIdx;
          var direction = me.direction;
          var pagesToRender = [];

          // Render the six pages including and surronding pageNum.
          var currentPage1 = pageIdx;
          if (currentPage1 >= 0 && currentPage1 < me.nPages) {
            pagesToRender.push(currentPage1);
          }

          var currentPage2 = pageIdx + direction * 1;
          if (currentPage2 >= 0 && currentPage2 < me.nPages) {
            pagesToRender.push(currentPage2);
          }

          var nextPage1 = pageIdx + direction * 2;
          if (nextPage1 >= 0 && nextPage1 < me.nPages) {
            pagesToRender.push(nextPage1);
          }

          var nextPage2 = pageIdx + direction * 3;
          if (nextPage2 >= 0 && nextPage2 < me.nPages) {
            pagesToRender.push(nextPage2);
          }

          var previousPage1 = pageIdx + direction * (-1);
          if (previousPage1 >= 0 && previousPage1 < me.nPages) {
            pagesToRender.push(previousPage1);
          }

          var previousPage2 = pageIdx + direction * (-2);
          if (previousPage2 >= 0 && previousPage2 < me.nPages) {
            pagesToRender.push(previousPage2);
          }
          return pagesToRender;
        },
      });

      me.docViewer.getDisplayModeManager().setDisplayMode(me.displayMode);
      me.docViewer.defaults.DisplayMode = me.displayMode;

      me.docViewer.on('documentLoaded', _(this.onDocumentLoaded).bind(this));
    },

    onDocumentLoaded: function() {
      this.doc = this.docViewer.getDocument();
      this.nPages = this.doc.getPageCount();

      // Current workaround for limitations in turn.js.
      // Hopefully the author fixes the performance problem in the future.
      var maxPages = 50;
      if (this.nPages > maxPages) {
        this.nPages = maxPages;
      }

      this.loadFlipBook();
    },

    loadFlipBook: function() {
      var me = this;

      var page = this.doc.getPageInfo(0);

      // Limit the size of the flipbook.
      var maxWidth = 600.0;
      if (page.width > maxWidth) {
        this.zoom = maxWidth / page.width;
        this.docViewer.zoomTo(maxWidth / page.width);
      }

      // Append a div for each page that will be loaded.
      for (var i = 0, len = this.nPages; i < len; i++) {
        this.$viewer.append($('<div style="background: white;" id="pageSection' + i + '"></div>').append('<div style="background: white;" id="pageContainer' + i + '"></div>'));
      }

      var width = page.width * 2 * this.zoom;
      var height = page.height * this.zoom;

      // Center vertically.
      me.adjustDocPad(page.height * this.zoom);

      // Center horizontally.
      var cPt = -page.width * 2 * this.zoom / 4;
      this.$viewer.css('left', cPt + 'px');

      var visiblePages = [];
      if (this.nPages > 0) {
        visiblePages.push(0);
      }
      if (this.nPages > 1) {
        visiblePages.push(1);
      }
      if (this.nPages > 2) {
        visiblePages.push(2);
      }
      me.docViewer.updateView(visiblePages);

      // Init turn.js.
      this.$viewer.turn({
        width: width,
        height: height,
        acceleration: true,
        shadows: !$.isTouch
      })
        .bind('turned', _(this.onPageFlip).bind(this));

      // Keep the flipbook centered vertically on resize.
      $(exports).resize(function() {
        me.adjustDocPad(height);
      });

      this.$viewer.css('visibility', 'visible');
    },

    onPageFlip: function(e, pageNum) {
      var me = this;

      // pageNum represent either a page on the left or the right.
      // If a forward flip is done, then the new page is on the left and pageNum represents it.
      // Likewise, if a backwards flip is done, then the new page is on the right and pageNum represents it.

      var pageIdx = pageNum - 1;
      if ((pageIdx - this.currentPageIdx) >= 0) {
        // A forward flip.
        this.direction = 1;
      } else {
        // A backwards flip.
        this.direction = -1;
      }
      this.currentPageIdx = pageIdx;


      // Set a timeout for the call to updateView in case a new page flip happens and we don't have to
      // waste time rendering pages that will not be visible.

      // Cancel the previous call to updateView.
      clearTimeout(this.flipTimeout);

      // Start a new timeout for updateView.
      this.flipTimeout = setTimeout(function() {
        me.docViewer.updateView();
      }, 200);
    },

    adjustDocPad: function(height) {
      height = height || this.totalHeight;

      // Adjust the document padding to centre the content.
      var pad = 0;
      var dpad = document.getElementById('docpad');
      if (dpad === null) {
        return;
      }

      if (exports.innerHeight > height) {
        pad = (exports.innerHeight - height) / 2;
      }

      dpad.style.marginBottom = parseInt(pad, 10) + 'px';
    }
  };
  exports.ReaderControl = ReaderControl;
})(window);

$(function() {
  var readerControl = new ReaderControl();
  var queryParams = window.ControlUtils.getQueryStringMap();

  var doc = queryParams.getString('d');
  if (doc === null) {
    return;
  }

  var streaming = queryParams.getBoolean('streaming', false);

  var partRetriever;
  try {
    if (streaming) {
      partRetriever = new window.CoreControls.PartRetrievers.StreamingPartRetriever(doc, true);
    } else {
      partRetriever = new window.CoreControls.PartRetrievers.HttpPartRetriever(doc, true);
    }
  } catch (err) {
    alert('err');
  }
  readerControl.docViewer.loadAsync(partRetriever);
});