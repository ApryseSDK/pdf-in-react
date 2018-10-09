$(document).bind('viewerLoaded', function() {
  var me = readerControl;

  var displayMode = new window.CoreControls.DisplayMode(readerControl.docViewer, window.CoreControls.DisplayModes.Custom, true);

  // override the display mode functions for the custom display mode
  displayMode.setCustomFunctions({
    windowToPage: function(windowPt, pageIndex) {
      var zoom = me.docViewer.getZoom();

      var pc = document.getElementById('pageContainer' + pageIndex);

      var scaledPt = {
        x: windowPt.x - pc.offsetLeft,
        y: windowPt.y - pc.offsetTop
      };

      return {
        'pageIndex': pageIndex,
        x: scaledPt.x / zoom,
        y: scaledPt.y / zoom
      };
    },

    pageToWindow: function(pagePt, pageIndex) {
      var zoom = me.docViewer.getZoom();
      var scaledPt = {
        x: pagePt.x * zoom,
        y: pagePt.y * zoom
      };

      var pc = document.getElementById('pageContainer' + pageIndex);

      return {
        x: scaledPt.x + pc.offsetLeft,
        y: scaledPt.y + pc.offsetTop
      };
    },

    getSelectedPages: function(mousePt1, mousePt2) {
      var firstPageIndex = null;
      var lastPageIndex = null;

      var doc = me.docViewer.getDocument();
      (function() {
        for (var i = 0; i < me.docViewer.getPageCount(); i++) {
          var page = doc.getPageInfo(i);

          var pc = document.getElementById('pageContainer' + i);

          var pageRect = {
            x1: pc.offsetLeft,
            y1: pc.offsetTop,
            x2: pc.offsetLeft + page.width * me.docViewer.getZoom(),
            y2: pc.offsetTop + page.height * me.docViewer.getZoom()
          };

          if (firstPageIndex === null && mousePt1.x <= pageRect.x2
                        && mousePt1.x >= pageRect.x1
                        && mousePt1.y <= pageRect.y2
                        && mousePt1.y >= pageRect.y1) {
            firstPageIndex = i;
          }

          if (lastPageIndex === null && mousePt2.x <= pageRect.x2
                        && mousePt2.x >= pageRect.x1
                        && mousePt2.y <= pageRect.y2
                        && mousePt2.y >= pageRect.y1) {
            lastPageIndex = i;
          }

          if (firstPageIndex !== null && lastPageIndex !== null) {
            return;
          }
        }
      })();

      if (firstPageIndex > lastPageIndex) {
        var tmpIdx = firstPageIndex;
        firstPageIndex = lastPageIndex;
        lastPageIndex = tmpIdx;
      }

      return {
        first: firstPageIndex,
        last: lastPageIndex
      };
    },

    getVisiblePages: function() {
      var pageIndexes = [];

      var scrollContainer = $('#DocumentViewer');
      var viewportTop = scrollContainer.scrollTop() + scrollContainer.offset().top;
      var viewportBottom = viewportTop + (scrollContainer.innerHeight());
      var viewportLeft = scrollContainer.scrollLeft() + scrollContainer.offset().left;
      var viewportRight = viewportLeft + (scrollContainer.innerWidth());

      var doc = me.docViewer.getDocument();
      var page;

      for (var i = 0; i < me.docViewer.getPageCount(); i++) {
        page = doc.getPageInfo(i);

        var pt1 = this.pageToWindow({
          x: 0,
          y: 0
        }, i);

        var pt2 = this.pageToWindow({
          x: page.width,
          y: page.height
        }, i);

        if ((pt1.x < pt2.x ? pt1.x : pt2.x) <= viewportRight
                    && (pt1.x < pt2.x ? pt2.x : pt1.x) >= viewportLeft
                    && (pt1.y < pt2.y ? pt1.y : pt2.y) <= viewportBottom
                    && (pt1.y < pt2.y ? pt2.y : pt1.y) >= viewportTop) {
          pageIndexes.push(i);
        }
      }

      return pageIndexes;
    },

    getPageTransform: function(pageIndex) {
      var page = me.docViewer.getDocument().getPageInfo(pageIndex);

      return {
        x: 0,
        y: 0,
        width: page.width,
        height: page.height
      };
    },

    createPageSections: function() {
      var doc = me.docViewer.getDocument();
      var totalWidth = 0;

      forEachPage(function(i) {
        var page = doc.getPageInfo(i);
        totalWidth += page.width;
        createPageSection(i, page.height, page.width);
      });

      // update the view with the new total width that we've calculated
      $('#viewer').css('width', totalWidth * me.docViewer.getZoom() + me.docViewer.getPageCount() * me.docViewer.getMargin() * 2);

      me.docViewer.updateVisiblePages();
    }
  });

  function createPageSection(pageIndex, pageHeight, pageWidth) {
    var ps = $('<div>')
      .attr('id', 'pageSection' + pageIndex)
      .css({
        'width': Math.floor(pageWidth * me.docViewer.getZoom()) + 'px',
        'height': Math.floor(pageHeight * me.docViewer.getZoom()) + 'px',
        'margin': me.docViewer.getMargin() + 'px',
        'float': 'left'
      });

    var pc = $('<div>')
      .attr('id', 'pageContainer' + pageIndex)
      .addClass('pageContainer')
      .css({
        'z-index': 1,
        'width': Math.floor(pageWidth * me.docViewer.getZoom()) + 'px',
        'height': Math.floor(pageHeight * me.docViewer.getZoom()) + 'px'
      });

    ps.append(pc);

    $('#viewer').append(ps);
  }

  readerControl.docViewer.getDisplayModeManager().setDisplayMode(displayMode);
  readerControl.docViewer.defaults.DisplayMode = displayMode;

  // hide some buttons that aren't implemented
  $('.drop-content').hide().prev().hide();
  $('#rotateButton').hide().prev().hide();
  $('#fitModes').hide().prev().hide();
  $('#docpad').remove();

  // remove the mouse wheel listener because it doesn't make sense to scroll this view vertically
  // could be changed to have an alternate implementation that scrolls sideways
  $('#DocumentViewer').unbind('mousewheel');
});

var rightToLeft = false;

function forEachPage(callback) {
  var totalPages = readerControl.docViewer.getPageCount();
  var i;

  if (rightToLeft) {
    for (i = totalPages - 1; i >= 0; i--) {
      callback(i);
    }
  } else {
    for (i = 0; i < totalPages; i++) {
      callback(i);
    }
  }
}

function getScrollbarSize() {
  var div = $('<div style="width:50px;height:50px;overflow:hidden;position:absolute;top:-200px;left:-200px;"><div style="height:100px;"></div></div>');
  $('body').append(div);
  var w1 = $('div', div).innerWidth();
  div.css('overflow-y', 'auto');
  var w2 = $('div', div).innerWidth();
  $(div).remove();
  return (w1 - w2);
}

$(document).bind('documentLoaded', function() {
  // fit to the height of the first page
  var doc = readerControl.docViewer.getDocument();
  var fitZoom = ($('#DocumentViewer').innerHeight() - getScrollbarSize() - readerControl.docViewer.getMargin() * 2) / doc.getPageInfo(0).height;
  readerControl.setZoomLevel(fitZoom);
  readerControl.setCurrentPageNumber(1);
});