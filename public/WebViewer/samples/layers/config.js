$('<link/>', {
  rel: 'stylesheet',
  type: 'text/css',
  href: 'Resources/dist/themes/default/style.min.css'
}).appendTo('head');

$('#tabMenu').append('<li><a href="#tabs-4"><span title="Layers" class="glyphicons customicons sort"></span></a></li>');
var layersTab = $('<div id="tabs-4"></div>');

$('#tabs').append(layersTab);
$('#tabs-4').append('<div id="layerView" style="height: 100%; overflow: auto;"></div>');

$.getScript('Resources/dist/jstree.min.js', function() {
  $(document).on('documentLoaded', function() {
    $('#layerView').jstree('destroy'); // clear layers so state is not retained between documents
    $('#layerView').jstree({
      'core': {
        'themes': {
          // "variant" : "large",
          'stripes': true
        },
        'check_callback': true
      },
      'checkbox': {
        'keep_selected_style': true
      },
      'plugins': ['checkbox']
    });

    var doc = readerControl.docViewer.getDocument();

    var layerArray;
    doc.getLayersArray().then(function(layerData) {
      displayLayers(layerData, $('#layerView'), 0);

      function displayLayers(layer, parentNode, id) {
        for (var i = 0; i < layer.length; i++) {
          var layerID = 'layer' + id;
          id++;
          var node = $('#layerView').jstree('create_node', parentNode, { 'text': layer[i].name, 'id': layerID });
          layer[i].id = layerID;

          if (layer[i].children.length > 0) {
            id = displayLayers(layer[i].children, node, id);
          }

          if (layer[i].visible === undefined) {
            // layer is actually a group, so disable its checkbox
            $('#layerView').jstree('disable_checkbox', node);
          } else if (layer[i].visible) {
            // var childNode = $("#layerView").jstree().get_node(layerID); // note that idToCheck is not preceded by '#' as it's non DOM
            // $("#layer0").jstree().check_node(childNode);
            $('#layerView').jstree('check_node', node);
          } else {
            $('#layerView').jstree('uncheck_node', node);
          }
        }
        return id;
      }
      layerArray = layerData;
      console.log(layerArray);

      // eslint-disable-next-line no-unused-vars
      function setLayerVisibility(layer, parentNode, id) {
        for (var i = 0; i < layer.length; i++) {
          var layerID = 'layer' + id;
          id++;
          if (layer[i].visible) {
            $('#layerView').jstree('check_node', [$('#' + layerID)]);
          }

          if (layer[i].children.length > 0) {
            id = displayLayers(layer[i].children, $('#' + layerID), id);
          }
        }
        return id;
      }
    });

    function updateLayers(layer, idvalues, parent) {
      for (var j = 0; j < layer.length; j++) {
        if (layer[j].visible !== undefined) {
          layer[j].visible = false;
          for (var k = 0; k < idvalues.length; k++) {
            if (layer[j].id === idvalues[k]) {
              layer[j].visible = true;
            }
          }
        }
        if (layer[j].children.length > 0) {
          updateLayers(layer[j].children, idvalues, layer[j]);
        }
        if (layer[j].visible && parent !== undefined && parent.visible === false) {
          // make parent visible as well
          parent.visible = true;
        }
      }
    }

    $('#layerView').on('changed.jstree', function(e, data) {
      if (layerArray !== undefined) {
        updateLayers(layerArray, data.selected, undefined);
        doc.setLayersArray(layerArray);
        readerControl.docViewer.refreshAll();
        readerControl.docViewer.updateView();
      }
    });
  });
});

// # sourceURL=Config.js