ReaderControl.config.customStyle = '../../samples/color-separations/config.css';

$('#tabMenu').append('<li><a href="#tabs-4"><span title="Color Separations" class="glyphicons tint"></span></a></li>');
var layersTab = $('<div id="tabs-4"></div>');

var $tabs = $('#tabs');
$('#tabs').append(layersTab);
var $colorSeparationsView = $('<div id="colorSeparationsView" style="height: 100%; overflow: auto;"></div>');
$('#tabs-4').append($colorSeparationsView);


var $colorList = $('<div class="colorList"></div>');
$colorSeparationsView.append($colorList);

$(document).on('documentLoaded', function() {
  $tabs.tabs('option', 'active', 3);
  $colorList.empty();

  readerControl.setShowSideWindow(true);

  var docViewer = readerControl.docViewer;
  var doc = docViewer.getDocument();
  doc.enableColorSeparations(true);

  doc.on('colorSeparationAdded', function(e, colorData) {
    // add the separation into the tab
    var $colorContainer = $('<div class="colorContainer"></div>');
    $colorContainer.attr('data-name', colorData.name);

    var $checkbox = $('<input type="checkbox"/>');
    $checkbox.prop('checked', colorData.enabled);
    $checkbox.on('change', function() {
      doc.enableSeparation(colorData.name, $checkbox.prop('checked'));
      docViewer.refreshAll();
      docViewer.updateView();
    });
    $colorContainer.append($checkbox);

    var $colorBox = $('<span class="colorbox"></span>');
    $colorBox.css('background-color', colorDataToCSS(colorData.rgb));
    $colorContainer.append($colorBox);

    var $colorText = $('<div class="colorText"></div>');
    $colorText.attr('title', colorData.name);
    $colorText.text(colorData.name);
    $colorContainer.append($colorText);

    var $colorValue = $('<span class="colorValue"></span>');
    $colorContainer.append($colorValue);

    $colorList.append($colorContainer);
  });

  // on every mouse move calculate the separation values at that point
  docViewer.on('mouseMove', function(e, nativeE) {
    $('.colorValue').text('');

    var mouseLocation = docViewer.getToolMode().getMouseLocation(nativeE);
    var displayMode = docViewer.getDisplayModeManager().getDisplayMode();

    var pageIndex = displayMode.getSelectedPages(mouseLocation, mouseLocation).first;
    if (pageIndex !== null) {
      var pageCoordinate = displayMode.windowToPage(mouseLocation, pageIndex);
      if (pageCoordinate) {
        var pageNumber = pageCoordinate.pageIndex + 1;
        var x = pageCoordinate.x;
        var y = pageCoordinate.y;
        var results = readerControl.docViewer.getColorSeparationsAtPoint(pageNumber, x, y);
        for (var i = 0; i < results.length; ++i) {
          $('.colorContainer[data-name="' + results[i].name + '"] .colorValue').text(results[i].value + '%');
        }
      }
    }
  });
});

function colorDataToCSS(color) {
  return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
}