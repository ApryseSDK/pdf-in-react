(function() {
  $(document).on('documentLoaded', function() {
    var annotManager = readerControl.docViewer.getAnnotationManager();

    $.ajax({
      url: '../../samples/hide-annotations/annots.xfdf',
      success: function(data) {
        annotManager.drawAnnotationsFromList(annotManager.importAnnotations(data));
      },
      dataType: 'xml'
    });


    function createCheckbox(user) {
      var $div = $('<div>');
      var $checkbox = $('<input type="checkbox">').prop('checked', true);
      $div.append($checkbox);
      $checkbox.on('change', function() {
        // find the annotations that belong to this user
        var userAnnots = annotManager.getAnnotationsList().filter(function(annot) {
          return annot.Author === user;
        });
        // hide or show only these annotations
        if ($(this).prop('checked')) {
          annotManager.showAnnotations(userAnnots);
        } else {
          annotManager.hideAnnotations(userAnnots);
        }
      });
      $div.append('<span>' + user + '</span>');
      return $div;
    }

    var $dialog = $('<div>');
    $dialog.append('<div>Hide and show user annotations</div><br>');
    $dialog.append(createCheckbox('Alice'));
    $dialog.append(createCheckbox('Bob'));
    $dialog.append(createCheckbox('Guest'));

    $dialog.dialog({
      position: {
        within: document.body
      }
    });
  });
})();