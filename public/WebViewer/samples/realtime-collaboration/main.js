/* global PDFTron, Server */
$(document).ready(function() {
  var queryParams = window.ControlUtils.getQueryStringMap(false);
  var docType = queryParams.getString('doctype', 'xod');

  // Instantiate WebViewer on viewerElement
  var viewerElement = document.getElementById('viewer');
  var myWebViewer = new PDFTron.WebViewer({
    type: 'html5',
    path: '../../lib',
    l: window.sampleL, // replace with your own license key and remove the samples-key.js script tag
    initialDoc: '../files/korea.' + docType,
    documentId: 'realtime_collaboration_sample',
    enableAnnotations: true,
  }, viewerElement);

  // Instantiate server
  var server = new Server();

  $(viewerElement).on('documentLoaded', function() {
    myWebViewer.getInstance().showNotesPanel(true);

    var annotationManager = myWebViewer.getInstance().docViewer.getAnnotationManager();
    var authorId = null;

    // Bind server-side authorization state change to a callback function
    // The event is triggered in the beginning as well to check if author has already signed in
    server.bind('onAuthStateChanged', function(user) {
      // Author is logged in
      if (user) {
        // Using uid property from Firebase Database as an author id
        // It is also used as a reference for server-side permission
        authorId = user.uid;
        // Check if author exists, and call appropriate callback functions
        server.checkAuthor(authorId, openReturningAuthorPopup, openNewAuthorPopup);
        // Bind server-side data events to callback functions
        // When loaded for the first time, onAnnotationCreated event will be triggered for all database entries
        server.bind('onAnnotationCreated', onAnnotationCreated);
        server.bind('onAnnotationUpdated', onAnnotationUpdated);
        server.bind('onAnnotationDeleted', onAnnotationDeleted);
      } else {
        // Author is not logged in
        server.signInAnonymously();
      }
    });

    // Bind annotation change events to a callback function
    annotationManager.on('annotationChanged', function(e, annotations, type) {
      // e.imported is true by default for annotations from pdf and annotations added by importAnnotCommand
      if (e.imported) {
        return;
      }
      // Iterate through all annotations and call appropriate server methods
      annotations.forEach(function(annotation) {
        var parentAuthorId = null;
        var xfdf = annotationManager.getAnnotCommand();
        if (type === 'add') {
          // In case of replies, add extra field for server-side permission to be granted to the
          // parent annotation's author
          if (annotation.InReplyTo) {
            parentAuthorId = annotationManager.getAnnotationById(annotation.InReplyTo).authorId || 'default';
          }
          server.createAnnotation(annotation.Id, {
            authorId: authorId,
            parentAuthorId: parentAuthorId,
            xfdf: xfdf
          });
        } else if (type === 'modify') {
          // In case of replies, add extra field for server-side permission to be granted to the
          // parent annotation's author
          if (annotation.InReplyTo) {
            parentAuthorId = annotationManager.getAnnotationById(annotation.InReplyTo).authorId || 'default';
          }
          server.updateAnnotation(annotation.Id, {
            authorId: authorId,
            parentAuthorId: parentAuthorId,
            xfdf: xfdf
          });
        } else if (type === 'delete') {
          server.deleteAnnotation(annotation.Id);
        }
      });
    });

    // Overwrite client-side permission check method on the annotation manager
    // The default was set to compare the authorName
    // Instead of the authorName, we will compare authorId created from the server
    annotationManager.setPermissionCheckCallback(function(author, annotation) {
      return annotation.authorId === authorId;
    });

    function onAnnotationCreated(data) {
      // Import the annotation based on xfdf command
      var annotation = annotationManager.importAnnotCommand(data.val().xfdf)[0];
      // Set a custom field authorId to be used in client-side permission check
      annotation.authorId = data.val().authorId;
      annotationManager.redrawAnnotation(annotation);
      myWebViewer.getInstance().fireEvent('updateAnnotationPermission', [annotation]);
    }

    function onAnnotationUpdated(data) {
      // Import the annotation based on xfdf command
      var annotation = annotationManager.importAnnotCommand(data.val().xfdf)[0];
      // Set a custom field authorId to be used in client-side permission check
      annotation.authorId = data.val().authorId;
      annotationManager.redrawAnnotation(annotation);
    }

    function onAnnotationDeleted(data) {
      // data.key would return annotationId since our server method is designed as
      // annotationsRef.child(annotationId).set(annotationData)
      var command = '<delete><id>' + data.key + '</id></delete>';
      annotationManager.importAnnotCommand(command);
    }

    function openReturningAuthorPopup(authorName) {
      // The author name will be used for both WebViewer and annotations in PDF
      annotationManager.setCurrentUser(authorName);
      // Open popup for the returning author
      $('.returning-author .name').html(authorName);
      $('.returning-author').css('display', 'block').click(function(e) {
        e.stopPropagation();
      });
      $('.popup-container').click(function() {
        $('.popup-container').css('display', 'none');
      });
      $('.popup-container').keypress(function(e) {
        if (e.which === 13) {
          $('.popup-container').css('display', 'none');
        }
      });
    }

    function openNewAuthorPopup() {
      // Open popup for a new author
      $('.new-author').css('display', 'block');
      $('.new-author .button').click(function() {
        var authorName = $('.new-author .name').get(0).value.trim();
        if (authorName) {
          updateAuthor(authorName);
        }
      });
      $('.popup-container').keypress(function(e) {
        var authorName = $('.new-author .name').get(0).value.trim();
        if (e.which === 13 && authorName) {
          updateAuthor(authorName);
        }
      });
    }

    function updateAuthor(authorName) {
      // The author name will be used for both WebViewer and annotations in PDF
      annotationManager.setCurrentUser(authorName);
      // Create/update author information in the server
      server.updateAuthor(authorId, { authorName: authorName });
      $('.popup-container').css('display', 'none');
    }
  });
});
