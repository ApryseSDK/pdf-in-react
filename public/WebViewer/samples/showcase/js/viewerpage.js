/* global Showcase, Utils */
(function(exports) {
  var flags = checkFlags(Utils.GetQueryVariable('options') || Utils.GetQueryVariable('o'));
  var settings = {
    topbarEnabled: false,
    galleryEnabled: false,
    collabEnabled: false,
    annotsEnabled: true,
  };

  function copyLink() {
    var $temp = $('<input>');
    $('body').append($temp);
    $temp.val(window.location.href).select();
    document.execCommand('copy');
    $temp.remove();
    $('#clickthrough-overlay, #notification').removeClass('notshown');
    $('#notification').fadeOut(3000, function() {
      $('#clickthrough-overlay, #notification').addClass('notshown');
      $('#notification').fadeIn();
    });
  }

  function uploadUrl() {
    var preNetFunc = function() {
      document.getElementById('progresstext').innerHTML = 'Uploading...';
      $('#droptarget').addClass('notshown');
      $('#overlay,#uploadprogress').removeClass('notshown');
    };

    var options = {
      pre_request_func: preNetFunc,
      open_func: Showcase.OpenDoc,
      thumb_func: Showcase.OnThumbComplete,
      progress_func: Showcase.SetProgress
    };
    Showcase.docManager.CreateFromURI(document.getElementById('uriinput').value, options);
  }

  function checkFlags(options) {
    options = options || '1111';
    var flags = {
      gallery: false,
      topbar: false,
      annots: false,
      collab: false
    };
    if (options === null || options === undefined) {
      return flags;
    }

    flags.gallery = options[0] === '1';
    flags.topbar = options[1] === '1';
    flags.annots = options[2] === '1';
    flags.collab = options[3] === '1';

    return flags;
  }

  function toggleGallery(val) {
    if (val === false) {
      $('#gallery').addClass('invisible');
      settings.galleryEnabled = false;
    } else {
      if ($('#gallery').hasClass('invisible')) {
        $('#gallery').removeClass('invisible');
      }
      settings.galleryEnabled = true;
    }
  }

  function toggleTopBar(val) {
    if (val === false) {
      $('#topbar').addClass('invisible');
      settings.topbarEnabled = false;
    } else {
      if ($('#topbar').hasClass('invisible')) {
        $('#topbar').removeClass('invisible');
      }
      settings.topbarEnabled = true;
    }
  }

  function toggleCollab(val) {
    var bbAnnotManager = this.window.myWebViewer.getInstance().bbAnnotManager || this.window.myWebViewer.getInstance().getBBAnnotManager();
    settings.collabEnabled = val;
    if (Showcase.docInitialLoadComplete) {
      if (val === true) {
        initiateAnonymousCollab();
        if (settings.annotsEnabled === false) {
          toggleAnnotations(true);
        }
      } else {
        bbAnnotManager.disableCollaboration();
        if (settings.annotsEnabled === true) {
          toggleAnnotations(false);
        }
      }
    }
  }

  function initiateAnonymousCollab() {
    if (window.myWebViewer) {
      var bbAnnotManager = window.myWebViewer.getInstance().bbAnnotManager || window.myWebViewer.getInstance().getBBAnnotManager();
      var onOpen = function(event, userName) {
        var titleElement = document.getElementById('user-header');
        titleElement.innerHTML = userName;
        $('.topbar').removeClass('hideshare');
      };

      var onClose = function() {
        var titleElement = document.getElementById('user-header');
        titleElement.innerHTML = '';
        $('.topbar').addClass('hideshare');
      };

      bbAnnotManager.on('blackBoxAnnotationsEnabled', onOpen);
      bbAnnotManager.on('blackBoxAnnotationsDisabled', onClose);
      bbAnnotManager.initiateCollaboration(Showcase.currentDocObj.doc_id);

      Showcase.viewerPage.EnableButtons();
    }
  }

  function toggleAnnotations(val) {
    settings.annotsEnabled = val;
    if (Showcase.docInitialLoadComplete) {
      if (val === true) {
        window.showAnnotations();
      } else {
        window.hideAnnotations();
      }
    }
  }

  function getOptionsString() {
    return (settings.galleryEnabled ? '1' : '0') +
      (settings.topbarEnabled ? '1' : '0') +
      (settings.annotsEnabled ? '1' : '0') +
      (settings.collabEnabled ? '1' : '0');
  }

  function Show(gallery, topbar, collab, annots) {
    $('#vertcontainer').removeClass('invisible');
    $('#overlay').removeClass('invisible');

    if (gallery !== null && gallery !== undefined && gallery !== settings.galleryEnabled) {
      toggleGallery(gallery);
    }

    if (topbar !== null && topbar !== undefined && topbar !== settings.topbarEnabled) {
      toggleTopBar(topbar);
    }

    if (annots !== null && annots !== undefined && annots !== settings.annotsEnabled) {
      toggleAnnotations(annots);
    }

    if (collab !== null && collab !== undefined && collab !== settings.collabEnabled) {
      toggleCollab(collab);
    }
  }

  function EnableButtons() {
    $('#share-section').removeClass('notshown');
  }

  function Hide() {
    $('#vertcontainer').addClass('invisible');
    $('#overlay').addClass('invisible');

    $('#landingcontainer').removeClass('invisible');
    $('#landingpane').removeClass('invisible');
    $('#titlerow').removeClass('invisible');
  }

  $('#uploadurlic').click(function() {
    uploadUrl();
  });

  $('#uploadurlname').click(function() {
    uploadUrl();
  });

  $('.share #share-link-button').click(function() {
    copyLink();
  });

  $('#documentation').click(function() {
    window.open('https://www.pdftron.com/documentation/web/guides/integrate');
  });

  $('#samples').click(function() {
    window.open('../../samples.html');
  });

  toggleGallery(flags.gallery);
  toggleTopBar(flags.topbar);
  settings.annotsEnabled = flags.annots;
  settings.collabEnabled = flags.collab;

  exports.ViewerPage = {
    settings: settings,
    GetFlags: getOptionsString,
    Show: Show,
    Hide: Hide,
    EnableButtons: EnableButtons,
    toggleAnnotations: toggleAnnotations,
    initiateAnonymousCollab: initiateAnonymousCollab,
    toggleCollab: toggleCollab,
    toggleTopBar: toggleTopBar,
    toggleGallery: toggleGallery,
  };
})(window);