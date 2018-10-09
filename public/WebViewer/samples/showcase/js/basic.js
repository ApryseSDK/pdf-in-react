/* global DocManager, LandingPage, Showcase, Utils, ViewerPage */
(function(exports) {
  var urlRoot = 'https://demo.pdftron.com';
  var demoLoc = window.location.pathname.indexOf('/demo', 0);
  if (demoLoc !== 0) {
    urlRoot = Utils.joinPaths(urlRoot, window.location.pathname.substring(0, demoLoc), '/');
  }

  exports.Showcase = {
    dropTargetIcon: 'cloud-upload',
    urlRoot: urlRoot,
    apiRoot: Utils.joinPaths(urlRoot, 'demo/'),
    dataRoot: Utils.joinPaths(urlRoot, 'data/'),
    docUriObjMap: {},
    docThumbNameMap: {},
    recentList: [],
    maxRecentList: 10,
    docThumbCounter: 1,
    docManager: DocManager,
    viewerPage: ViewerPage,
    landingPage: LandingPage,
    currentDocObj: null,
    docInitialLoadComplete: false,
    useBlackboxInterface: true,
    disableStatePush: false,
    statePusher: PushState,
    SetupDropTarget: function(dragArea, dropEl, iconContainer, openFunc, preOpenFunc) {
      var $drop = $(dropEl);

      var landingDropOptions = {
        enter_ok_func: function(icons) {
          $drop.addClass('dragok anim'); DisplayIcons(iconContainer, icons);
        },
        enter_bad_func: function(icons) {
          $drop.addClass('dragbad anim'); DisplayIcons(iconContainer, icons);
        },
        enter_maybe_func: function(icons) {
          $drop.addClass('dragmaybe anim'); DisplayIcons(iconContainer, icons);
        },
        leave_func: function() {
          $drop.removeClass('dragnotok dragok dragbad dragmaybe');
          DisplayIcons(iconContainer, [Showcase.dropTargetIcon]);
        },
        thumb_func: Showcase.OnThumbComplete,
        pre_open_func: preOpenFunc || NullFunc,
        open_func: openFunc || function(docObj) {
          Showcase.viewerPage.Show();
          Showcase.OpenDoc(docObj);
        }
      };
      if (!window.isIE10) {
        Showcase.docManager.AddDragHandler(dragArea, landingDropOptions);
      }
    },
    OnThumbComplete: function(docObj) {
      displayInGallery([docObj]);
      RefreshRecentObj(docObj);
    },
    SetProgress: function(fraction, percentText) {
      document.getElementById('progresstext').innerHTML = 'Uploading: ' + percentText;
    },
    OpenDoc: function(docObj) {
      if (!docObj) {
        Showcase.currentDocObj = null;

        if (window.document.wvCloseDoc) {
          window.document.wvCloseDoc();
          AddToRecentList(null);
          $('#overlay,#droptarget').removeClass('notshown');
          $('#overlay').removeClass('hasdoc');
        }
        return;
      }
      if (!docObj.name) {
        return;
      }

      if (Showcase.currentDocObj && docObj.uri === Showcase.currentDocObj.uri) {
        $('#overlay,#uploadprogress').addClass('notshown');
        $('#droptarget').removeClass('notshown');
        Showcase.statePusher(docObj);
        return;
      }
      AddToRecentList(docObj);
      setTimeout(ClearProgressOverlay, 1000);

      Showcase.docUriObjMap[docObj.uri] = docObj;

      Showcase.statePusher(docObj); // add current doc to URL and browser history
      var options = {
        documentId: docObj.doc_id,
        filename: docObj.name
      };
      Showcase.currentDocObj = docObj;

      var uri = Showcase.useBlackboxInterface ? docObj.uri : Showcase.apiRoot + 'ViewDocument.jsp?file=' + encodeURIComponent(docObj.uri);
      window.myWebViewer.loadDocument(uri, options);
    }
  };

  var lastSelected = null;

  $.ajaxSetup({
    xhrFields: {
      withCredentials: true
    }
  });

  function DisplayIcons(element, icons) {
    if (!element) {
      return;
    }
    if (icons.length >= 5) {
      icons = ['files-o'];
    }
    for (var i = 0; i < icons.length; i++) {
      icons[i] = '<i class="fa fa-' + icons[i] + ' bigicon"></i>'
              + '<i class="fa fa-' + icons[i] + ' bigicon overlay"></i>';
    }
    if (icons.length > 0) {
      var newIcons = icons.join('<span class="iconsep">&emsp;</span>');
      if (element.innerHTML !== newIcons) {
        element.innerHTML = newIcons;
      }
    }
  }

  function RefreshRecentObj(docObj) {
    if (!docObj) {
      return;
    }
    for (var i = 0; docObj && i < Showcase.recentList.length; ++i) {
      if (Showcase.recentList[i].uri === docObj.uri) {
        Showcase.recentList[i] = docObj;
        RenderRecentList();
        return;
      }
    }
  }

  function AddToRecentList(docObj) {
    if (docObj && !(docObj.uri in Showcase.docUriObjMap)) {
      Showcase.docUriObjMap[docObj.uri] = docObj;
    }
    if (Showcase.recentList.length > 0) {
      if (Showcase.recentList[Showcase.recentList.length - 1] === null) {
        Showcase.recentList.pop();
      } else if (docObj && Showcase.recentList[Showcase.recentList.length - 1].uri === docObj.uri) {
        return false;
      }
    }

    for (var i = 0; docObj && i < Showcase.recentList.length; ++i) {
      if (Showcase.recentList[i].uri === docObj.uri) {
        if (!docObj.thumb) {
          docObj.thumb = Showcase.recentList[i].thumb;
        }
        Showcase.recentList.splice(i, 1);
      }
    }

    if (Showcase.recentList.length === Showcase.maxRecentList) {
      Showcase.recentList.shift();
    }
    Showcase.recentList.push(docObj);
    var titleElement = document.getElementById('topbar_landingrecentlist');
    titleElement.innerHTML = docObj ? docObj.name : '';
    RenderRecentList();
    return true;
  }

  function selectDoc(doc) {
    var id = Showcase.docThumbNameMap[doc];

    if (id === lastSelected) {
      return;
    }

    if (lastSelected !== null) {
      $('#' + lastSelected).removeClass('active');
    }

    $('#' + id).addClass('active');
    lastSelected = id;
    Showcase.OpenDoc(Showcase.docUriObjMap[doc]);
  }

  function displayInGallery(docList) {
    var $ul = $('#thumbnails');

    for (var i = 0; i < docList.length; i++) {
      if (!docList[i].thumb) {
        continue;
      }
      var docName = docList[i].name;
      var uri = docList[i].uri;
      var id = 'thumb' + Showcase.docThumbCounter;
      if (uri in Showcase.docThumbNameMap) {
        id = Showcase.docThumbNameMap[uri];
        $('#' + id).remove();
      } else {
        Showcase.docThumbNameMap[uri] = id;
        ++Showcase.docThumbCounter;
      }
      Showcase.docUriObjMap[uri] = docList[i];
      var element = '<img class="thumb selectionglow" src="' + Showcase.dataRoot
                  + (docList[i].thumb ? docList[i].thumb : 'Thumbs/waiting_thumb.png')
                  + '" alt="">';
      var $element = $(element);

      var $thumbContainer = $('<div id="' + id + '"class="thumb-container"></div>');
      // eslint-disable-next-line no-loop-func
      (function(thumbUri) {
        $thumbContainer.on('click', function() {
          selectDoc(thumbUri);
        });
      })(uri);
      $thumbContainer.append($element);

      var $docName = $('<div class="gallery-doc-name" title="' + docName + '">' + docName + '</div>');
      $thumbContainer.append($docName);

      if (docList.length === 1) {
        $ul.prepend($thumbContainer);
      } else {
        $ul.append($thumbContainer);
      }
    }
    // why, IE? why? (layout is not properly refreshed unless we force the issue)
    if (Utils.isIEBrowser()) {
      $('#gallery').addClass('invisible');
      setTimeout(function() {
        $('#gallery').removeClass('invisible');
      }, 10);
    }
  }

  function RenderRecentList() {
    var element = document.getElementById('landingrecentlist');
    element.onchange = null;
    var stringList = [];
    stringList.push('<div class="recenttitle" id="recenttitle">Recently opened files</div>');
    for (var i = Showcase.recentList.length - 1; i >= 0; i--) {
      if (Showcase.recentList[i] === null) {
        continue;
      }
      var docObj = Showcase.recentList[i];
      stringList.push('<div class="flexrow recentitem" index="' + i + '">'
          + '<div class="recentspacer"></div>'
          + '<div class="col text">'
          + '<div class="recentname">'
          + docObj.name + '</div></div>'
          + '<div class="thumbnail">'
          + (docObj && docObj.thumb ? '<img src="' + Showcase.dataRoot + docObj.thumb + '"/>' : '')
          + '</div>'
          + '<div class="recentoverlay"></div></div>');
    }
    element.innerHTML = stringList.join('');
    $('.recentitem .text, .recentitem .thumbnail').click(OnRecentListSelect);
  }

  function OnRecentListSelect(evt) {
    var parentEl = evt.currentTarget.parentNode;
    var index = parseInt(parentEl.getAttribute('index'), 10);
    document.getElementById('settingsrightpanel').scrollTop = 0;
    Showcase.landingPage.Hide(true);
    Showcase.OpenDoc(Showcase.recentList[index]);
    ClearProgressOverlay();
  }

  function NullFunc() {}
  function PushState(docObj) {
    if (Showcase.disableStatePush) {
      return;
    }
    var params = '?o=' + Showcase.viewerPage.GetFlags()
          + (docObj ? ('&doc=' + encodeURIComponent(docObj.uri)) : '')
          + (docObj ? ('&share=' + encodeURIComponent(docObj.share_id)) : '')
          + (!Showcase.useBlackboxInterface ? '&bbi=true' : '');
    history.pushState(docObj, docObj ? docObj.name : 'WebViewer', params);
  }

  function ReplaceState(docObj) {
    var params = '?o=' + Showcase.viewerPage.GetFlags()
          + (docObj ? ('&doc=' + encodeURIComponent(docObj.uri)) : '')
          + (docObj ? ('&share=' + encodeURIComponent(docObj.share_id)) : '');
    history.replaceState(docObj, docObj ? docObj.name : 'WebViewer', params);
  }


  function ClearProgressOverlay() {
    $('#overlay,#uploadprogress').addClass('notshown');
    $('#droptarget').removeClass('notshown');
  }

  function PopulateDocList(docList) {
    var existing = Showcase.recentList.slice(0);
    var avail = Showcase.maxRecentList - Showcase.recentList.length;
    var i;
    if (avail > 0) {
      Showcase.recentList = docList.slice(Math.max(0, docList.length - avail), docList.length);
      for (i = 0; i < Showcase.recentList.length; i++) {
        Showcase.docUriObjMap[Showcase.recentList[i].uri] = Showcase.recentList[i];
      }
    }

    var listRendered = false;
    for (i = 0; i < existing.length; i++) {
      listRendered |= AddToRecentList(existing[i]);
    }

    if (!listRendered) {
      RenderRecentList();
    }

    displayInGallery(docList);
  }

  function InitWV() {
    Showcase.useBlackboxInterface = Showcase.useBlackboxInterface && !Utils.GetQueryVariable('bbi');
    var viewerElement = document.getElementById('viewer');

    // for wv config to use
    document.trnCloseDoc = function() {
      Showcase.OpenDoc(null);
    };

    var options = {
      type: 'html5',
      path: '../../lib',
      mobileRedirect: false,
      enableAnnotations: true,
      serverUrl: null,
      l: window.sampleL, // replace with your own license key and remove the samples-key.js script tag
      config: 'js/basic-wv-config.js'
    };
    if (Showcase.useBlackboxInterface) {
      options.pdftronServer = Showcase.useBlackboxInterface ? Showcase.urlRoot : null;
    }
    window.myWebViewer = new PDFTron.WebViewer(options, viewerElement);
    // make sure this is always the right height -- 100% is not quite reliable
    // because of the flexbox growth
    var iframe = viewerElement.querySelector('iframe');
    iframe.setAttribute('height', 'auto');
    iframe.style.flex = 1;
    iframe.style.display = 'flex';

    var initialUri = Utils.GetQueryVariable('doc');
    var initialShareId = Utils.GetQueryVariable('share');

    var onViewerReady = function() {
      var clickfunc = function(e) {
        e.stopPropagation();
        $('#fileinput').click();
      };
      $('#uploadbutton').on('touchend click', clickfunc);
    };

    if (initialUri) {
      var docObj = null;
      var viewerReady = false;

      var openWhenReady = function() {
        if (docObj && viewerReady) {
          Showcase.OpenDoc(docObj);
          Showcase.docManager.GetServerDocListByAccess(PopulateDocList);
          Showcase.landingPage.EnableButtons();
        }
      };
      var createOptions = {
        open_func: function(newDocObj) {
          docObj = newDocObj;
          openWhenReady();
        },
        share_id: initialShareId ? decodeURIComponent(initialShareId) : null
      };
      var ext = Utils.GetQueryVariable('ext');
      if (ext) {
        createOptions.ext = ext;
      }
      Showcase.docManager.CreateFromURI(decodeURIComponent(initialUri), createOptions);

      // the div where webviewer will be rendered
      $('#viewer').bind('ready', function() {
        viewerReady = true;
        onViewerReady();
        openWhenReady();
      });
    } else {
      $('#viewer').bind('ready', function() {
        $('#overlay').removeClass('notshown');
        AddToRecentList(null);
        Showcase.docManager.GetServerDocListByAccess(PopulateDocList);
        onViewerReady();
        Showcase.landingPage.EnableButtons();
      });
    }

    $('#viewer').bind('documentLoaded', function() {
      Showcase.docInitialLoadComplete = true;
      $('#overlay').addClass('hasdoc');
      ClearProgressOverlay();
      // Call to initiate real time collab if annotations are enabled
      if (Showcase.viewerPage.settings.collabEnabled === true) {
        Showcase.viewerPage.initiateAnonymousCollab();
      }
    });
  }


  function onFileInputChange(e) {
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
    Showcase.docManager.CreateFromUpload(e.target.files[0], options);
  }

  if (Utils.GetQueryVariable('landing')) {
    Showcase.landingPage.Show();
  } else if (Utils.GetQueryVariable('settings') || Utils.GetQueryVariable('s')) {
    Showcase.landingPage.Show(true);
  }

  var overlayEl = document.getElementById('overlay');

  document.trn_dragenter_handler = function() {
    console.log('showing from dragenter');
    $(overlayEl).removeClass('notshown');
  };

  document.trn_dragleave_handler = function(e) {
    e.stopPropagation();
    e.preventDefault();
    if (overlayEl === e.target && (!e.relatedTarget || !$.contains(overlayEl, e.relatedTarget))) {
      if (Showcase.currentDocObj) {
        $(overlayEl).addClass('notshown');
      }
    }
  };

  $(overlayEl).on('dragleave', document.trn_dragleave_handler);

  Showcase.SetupDropTarget(document.getElementById('overlay'), document.getElementById('droptarget'), document.getElementById('droptargeticons'));

  var fileinput = document.getElementById('fileinput');
  fileinput.onchange = function(e) {
    onFileInputChange(e);
  };

  window.onpopstate = function(event) {
    if (event && event.state && event.state.isCheckboxObj) {
      Showcase.landingPage.Show(event.state.isStandalone);
      return;
    }
    Showcase.disableStatePush = true;
    Showcase.landingPage.Hide();
    Showcase.OpenDoc(event.state);
    ReplaceState(Showcase.currentDocObj);
    Showcase.disableStatePush = false;
  };

  // This call starts webviewer in the viewer div.
  InitWV();
})(window);