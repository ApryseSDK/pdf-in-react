/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */

(function() {
  //= ==========================================================================
  // Override the default loadDocument method to support encrypted documents
  //= ==========================================================================
  ReaderControl.prototype.loadDocument = function(doc) {
    console.log('loadDocument encrypt override');

    var me = this;

    var decryptDocument = function(password) {
      try {
        var decrypt = window.CoreControls.Encryption.decrypt;

        var partRetriever = new window.CoreControls.PartRetrievers.HttpPartRetriever(doc, true, decrypt, {
          p: password,
          type: 'aes',
          error: function(error) {
            alert(error);
          }
        });
      } catch (err) {
        console.error(err);
      }

      me.docViewer.loadAsync(partRetriever);
    };

    // create a password dialog for the user to enter in the document password
    // this could be replaced by a call to the server to get the password
    var passwordDialog = $('<div>').attr({
      'id': 'passwordDialog'
    });

    $('<label>').attr({
      'for': 'passwordInput'
    })
      .text('Enter the document password:')
      .appendTo(passwordDialog);

    var passwordInput = $('<input>').attr({
      'type': 'password',
      'id': 'passwordInput'
    }).keypress(function(e) {
      if (e.which === 13) {
        $(this).parent().next().find('button')
          .click();
      }
    }).appendTo(passwordDialog);

    passwordDialog.dialog({
      modal: true,
      closeOnEscape: false,
      position: {
        within: document.body
      },
      buttons: {
        'OK': function() {
          decryptDocument(passwordInput.val());

          $(this).dialog('close');
        }
      }
    });
  };
})();