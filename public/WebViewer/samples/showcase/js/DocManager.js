/* global Utils, Showcase */
(function(exports) {
  var _logFunc = function() {};
  var _docNameObjMap = {};
  var _pdfRegex = /\/pdf/ig;
  var _wordRegex = /(openxml.+word|\/msword)/ig;
  var _excelRegex = /openxml.+spreadsheet/ig;
  var _powerpointRegex = /openxml.+presentation/ig;
  var _pptRegex = /ms-powerpoint/ig;
  var _xlsRegex = /ms-excel/ig;
  var _odfRegex = /opendocument/ig;
  var _imageRegex = /image\//ig;
  var _allowedFilesRegex = /(\/pdf|\/[\w.]+openxml|image\/|opendocument|\/msword|ms-powerpoint|ms-excel)/ig;

  function NullFunc() {}

  function GetFileIcon(filetype) {
    if (filetype.search(_pdfRegex) !== -1) {
      return 'file-pdf-o';
    } else if (filetype.search(_imageRegex) !== -1) {
      return 'file-image-o';
    } else if (filetype.search(_wordRegex) !== -1) {
      return 'file-word-o';
    } else if (filetype.search(_odfRegex) !== -1) {
      return 'file-text-o';
    } else if (filetype.search(_powerpointRegex) !== -1) {
      return 'file-powerpoint-o';
    } else if (filetype.search(_pptRegex) !== -1) {
      return 'file-powerpoint-o';
    } else if (filetype.search(_excelRegex) !== -1) {
      return 'file-excel-o';
    } else if (filetype.search(_xlsRegex) !== -1) {
      return 'file-excel-o';
    } else if (filetype === 'unknown') {
      return 'question-circle-o';
    }
    return 'frown-o';
  }

  function SetLogFunc(newLogFunc) {
    _logFunc = newLogFunc;
  }

  function DocReference(inObj) {
    var dotLoc = inObj.name.lastIndexOf('.');
    return {
      uri: inObj.uri,
      name: inObj.name,
      share_id: inObj.share_id,
      ext: dotLoc > 0 ? inObj.name.substring(dotLoc) : null,
      doc_id: inObj.doc_id,
      thumb: inObj.thumb ? inObj.thumb : null
    };
  }

  function GetServerDocList(callback) {
    GetServerDocListImpl(callback);
  }

  function GetServerSharedDocList(callback) {
    GetServerDocListImpl(callback, { shared: true });
  }

  function GetServerDocListByAccess(callback) {
    GetServerDocListImpl(callback, { sort: 'access' });
  }

  function GetServerDocListImpl(callback, options) {
    var params = {};
    if (options.sort) {
      params.sort = options.sort;
    }
    if (options.shared) {
      params.shared = 1;
    }
    $.ajax({
      url: Utils.joinPaths(Showcase.apiRoot, 'ListFiles'),
      type: 'get',
      dataType: 'json',
      data: params,
      success: callback,
      error: function(xhr, textStatus) {
        console.log(textStatus);
      },
      async: true
    });
  }

  function AddDragHandler(element, options) {
    options.enter_ok_func = options.enter_ok_func || NullFunc;
    options.enter_bad_func = options.enter_bad_func || NullFunc;
    options.enter_maybe_func = options.enter_maybe_func || NullFunc;
    options.leave_func = options.leave_func || NullFunc;
    options.open_func = options.open_func || NullFunc;
    options.error_func = options.error_func || NullFunc;
    options.pre_open_func = options.pre_open_func || NullFunc;
    options.thumb_func = options.thumb_func || null;
    options.progress_func = options.progress_func || Showcase.SetProgress;

    var everythingOk = false;
    var $form = $(element);
    $form.on('drag dragend dragstart dragover dragenter dragleave drop', function(e) {
      e.stopPropagation();
      e.preventDefault();
    })
      .on('dragenter', function(e) {
        if (window.isIE10) {
          return;
        }
        var items = e.originalEvent.dataTransfer.items;
        var itemTypes = items ? [] : ['unknown'];
        var type = '';
        var okCount = items ? 0 : 1;
        var unknownCount = 0;
        for (var i = 0; items && i < items.length; i++) {
          if (items[i].kind === 'file') {
            type = items[i].type || 'unknown';
            if (!items[i].type) {
              ++unknownCount;
              itemTypes.push(GetFileIcon(type));
            } else if (type.search(_allowedFilesRegex) !== -1) {
              ++okCount;
              itemTypes.push(GetFileIcon(type));
            }
          }
        }
        if (okCount > 0) {
          options.enter_ok_func(itemTypes);
          everythingOk = true;
        } else if (unknownCount > 0) {
          options.enter_maybe_func(itemTypes);
          everythingOk = false;
        } else {
          options.enter_bad_func(itemTypes);
          everythingOk = false;
        }
      })
      .on('dragleave dragend', function(e) {
        if (e.target === element) {
          if (!$.contains(element, e.relatedTarget) && (!e.relatedTarget || e.relatedTarget.isConnected)) {
            options.leave_func();
          }
        }
      })
      .on('drop', function(e) {
        options.leave_func();
        if (!everythingOk) {
          return;
        }
        options.pre_open_func();
        document.getElementById('progresstext').innerHTML = 'Uploading...';
        $('#droptarget').addClass('notshown');
        $('#overlay,#uploadprogress').removeClass('notshown');
        everythingOk = false;
        var droppedFiles = e.originalEvent.dataTransfer.files;
        for (var i = 0; i < droppedFiles.length; i++) {
          if (droppedFiles[i].type.search(_allowedFilesRegex) !== -1) {
            CreateFromUpload(droppedFiles[i], options);
          }
        }
      });
  }

  function OptionStruct(inObj) {
    return {
      open_func: inObj.open_func,
      pre_request_func: inObj.pre_request_func || NullFunc,
      progress_func: inObj.progress_func || NullFunc,
      error_func: inObj.error_func || NullFunc,
      share_id: inObj.share_id ? inObj.share_id : null,
      ext: inObj.ext || null,
      thumb_func: inObj.thumb_func ? inObj.thumb_func : null
    };
  }

  function CreateFromURI(uri, callbacks) {
    var cb = OptionStruct(callbacks);
    if (!uri) {
      cb.error_func('empty URI');
      return;
    }
    if (uri in _docNameObjMap) {
      cb.open_func(_docNameObjMap[uri]);
      return;
    }

    var serverComm = function() {
      _logFunc('url ready for upload\n');

      var data = { uri: uri };
      if (cb.share_id) {
        data['share'] = cb.share_id;
      }
      if (cb.ext) {
        data['ext'] = cb.ext;
      }
      $.ajax({
        type: 'POST',
        url: Utils.joinPaths(Showcase.apiRoot, 'UploadFromURI.jsp'),
        data: data,
        dataType: 'json',
        success: function(data) {
          var docObj = DocReference(data);
          cb.open_func(docObj);
          MakeThumbsLater(docObj, cb.thumb_func);
        },
        error: function(e) {
          _logFunc('URI error!\n');
          cb.error_func(e);
        }
      });
    };

    serverComm();
  }

  function CreateFromUpload(file, callbacks) {
    var dotLoc = file.name.lastIndexOf('.');
    callbacks.ext = dotLoc > 0 ? file.name.substring(dotLoc) : null;
    var cb = OptionStruct(callbacks);
    if (file.name in _docNameObjMap) {
      cb.open_func(_docNameObjMap[file.name]);
      return;
    }
    cb.pre_request_func();
    var form = new FormData();
    form.append('file', file, file.name);
    _logFunc('File selected\n');
    $.ajax({
      type: 'POST',
      url: Utils.joinPaths(Showcase.apiRoot, 'Upload.jsp' + (cb.ext ? ('?ext=' + cb.ext) : '')),
      contentType: false, // results in multipart/form-data, with the correct boundary data settings
      data: form,
      processData: false,
      dataType: 'json',
      success: function(data) {
        var docObj = DocReference(data);
        cb.open_func(docObj);
        MakeThumbsLater(docObj, cb.thumb_func);
      },
      error: function(e) {
        _logFunc('Upload error!\n');
        cb.error_func(e);
      },
      xhr: function() {
        var xhr = $.ajaxSettings.xhr();
        xhr.upload.onprogress = function(evt) {
          if (evt.total === 0) {
            return;
          }
          var fraction = evt.loaded / evt.total;
          var percentText = parseInt(fraction * 100, 10) + '.' + parseInt(fraction * 0.1, 10) % 10 + '%';
          cb.progress_func(fraction, percentText);

          _logFunc('Upload progress: ' + evt.loaded + ' / '
                        + evt.total + ' (' + percentText + ')\n');
        };
        // set the onload event handler
        xhr.upload.onload = function() {
          _logFunc('File upload complete\n');
        };
        return xhr;
      }
    });
  }

  function MakeThumbsLater(docObj, callback, trial) {
    if (!trial) {
      trial = 0;
      if (Showcase.useBlackboxInterface) {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open('GET', Utils.joinPaths(Showcase.urlRoot, 'blackbox/PreloadURL?url='
                + encodeURIComponent(docObj.uri) + '&ext=' + docObj.ext));
        xmlHttp.withCredentials = true;
        xmlHttp.send();
      }
    }
    if (trial > 4) {
      return;
    }
    if (!callback) {
      console.log('Skipping thumb generation, no callback');
      return;
    }
    setTimeout(function() {
      $.ajax({
        url: Utils.joinPaths(Showcase.apiRoot, 'MakeThumbs.jsp'),
        type: 'get',
        dataType: 'json',
        cache: false,
        data: {
          uri: docObj.uri,
          share: docObj.share_id
        },
        success: function(docObject) {
          if (!docObject.thumb) {
            MakeThumbsLater(docObj, callback, trial + 1);
          } else {
            callback(docObject);
          }
        },
        error: function(xhr, textStatus) {
          _logFunc('Thumbnail generation error: \n' + textStatus);
        },
        async: true
      });
    }, trial * 1000 + 500);
  }

  exports.DocManager = {
    CreateFromURI: CreateFromURI,
    CreateFromUpload: CreateFromUpload,
    SetLogFunc: SetLogFunc,
    GetServerDocList: GetServerDocList,
    GetServerDocListByAccess: GetServerDocListByAccess,
    GetServerSharedDocList: GetServerSharedDocList,
    AddDragHandler: AddDragHandler
  };
})(window);