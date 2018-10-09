/* global Showcase, Utils */
(function(exports) {
  var _logFunc = function() {};
  var _isInit = false;
  var _buttonsInit = false;
  var _isShown = false;
  var _usagePoller = null;
  var _docIsIncoming = false;
  var _shouldBackOut = false;
  var _uriEnabled = true;
  var _preNetFunc = function() {
    document.getElementById('progresstext').innerHTML = 'Uploading...';
    $('#droptarget').addClass('notshown');
    $('#overlay,#uploadprogress').removeClass('notshown');
    Hide();
  };
  var _openFunc = function(docObj) {
    Hide();
    Showcase.OpenDoc(docObj);
  };

  var _checkboxes = {
    isStandalone: false,
    isCheckboxObj: true,
    featCollab: true,
    featCollabUser: true,
    featToolbar: true,
    featGallery: true,
    featAnnotsUser: true,
    featAnnots: true
  };

  function InitImpl() {
    if (_isInit) {
      return;
    }
    var storage = (typeof (Storage) !== 'undefined') ? window.localStorage : null;

    $('.optionrow.landingrow .optiontarget').click(function(e) {
      var selector = $(e.currentTarget.parentElement);
      if (selector.hasClass('collapsed')) {
        selector.removeClass('collapsed');
        if (storage && e.currentTarget.id) {
          storage.setItem(e.currentTarget.id, 'expanded');
        }
      } else {
        selector.addClass('collapsed');
        if (storage && e.currentTarget.id) {
          storage.setItem(e.currentTarget.id, 'collapsed');
        }
      }
    });
    function onFileInputChange(e) {
      _docIsIncoming = true;

      var options = {
        pre_request_func: _preNetFunc,
        open_func: _openFunc,
        thumb_func: Showcase.OnThumbComplete,
        progress_func: Showcase.SetProgress
      };
      Showcase.docManager.CreateFromUpload(e.target.files[0], options);
    }
    var fileinput = document.getElementById('landingfileinput');
    fileinput.onchange = onFileInputChange;
    $('.featurecolumn .feature').click(function(event) {
      ToggleFeature(event.currentTarget);
    });
    var opts = Utils.GetQueryVariable('o') || Utils.GetQueryVariable('options');
    if (opts) {
      var flags = {
        gallery: opts[0] === '1',
        toolbar: opts[1] === '1',
        annots: opts[2] === '1',
        collab: opts[3] === '1',
      };
      if (flags.gallery !== _checkboxes.featGallery) {
        ToggleFeature(document.getElementById('featGallery'));
      }
      if (flags.toolbar !== _checkboxes.featToolbar) {
        ToggleFeature(document.getElementById('featToolbar'));
      }
      if (flags.annots !== _checkboxes.featAnnots) {
        ToggleFeature(document.getElementById('featAnnots'));
      }
      if (flags.collab !== _checkboxes.featCollab) {
        ToggleFeature(document.getElementById('featCollab'));
      }
    }
    MarkHistory();
    GetServerInfo(ShowServerData);
    _isInit = true;
    EnableButtons();
  }

  function Show() {
    if (_isShown) {
      return;
    }
    $('#landingcontainer').removeClass('invisible');
    $('#landingpane').addClass('standalone');
    $('#landingcontainer').addClass('standalone').bind('click', ClickOutsideStandalone);

    _checkboxes.isStandalone = true;

    if (!_isInit) {
      InitImpl();
    }
    if (!_usagePoller) {
      CreateUsagePoller();
    }
    _isShown = true;
  }

  function MarkHistory() {
    var uriParam = _checkboxes.isStandalone ? '?s' : '?landing=true';
    var label = _checkboxes.isStandalone ? 'Settings Page' : 'Landing Page';
    history.replaceState(JSON.parse(JSON.stringify(_checkboxes)), label, uriParam);
  }

  function Hide(docIncoming) {
    if (!_isShown) {
      return;
    }

    if (_usagePoller) {
      clearTimeout(_usagePoller);
      _usagePoller = null;
    }

    Showcase.viewerPage.Show(_checkboxes.featGallery,
      _checkboxes.featToolbar, _checkboxes.featCollab, _checkboxes.featAnnots);
    if (!docIncoming && !_docIsIncoming && !Showcase.disableStatePush) {
      Showcase.statePusher(Showcase.currentDocObj);
    }
    _docIsIncoming = false;
    $('#landingcontainer').addClass('invisible').removeClass('standalone').unbind('click', ClickOutsideStandalone);
    $('#landingpane').addClass('standalone');
    _checkboxes.isStandalone = false;
    _isShown = false;
  }

  function SelectTab(inId) {
    $('div.menuselector').removeClass('selected');
    var startI = inId.indexOf('_');
    var id = inId.slice(startI + 1);
    var storage = (typeof (Storage) !== 'undefined') ? window.localStorage : null;
    if (id === 'last') {
      id = 'landingdroptarget';
      if (storage) {
        id = storage.getItem('last-setting-menu') || id;
      }
    } else if (storage) {
      storage.setItem('last-setting-menu', id);
    }
    $('#left_' + id).addClass('selected');
    $('.hideable').addClass('notselected');
    $('.notselected .anim').removeClass('anim');
    $(document.getElementById(id)).removeClass('notselected anim');
  }

  function EnableButtons() {
    if (!_isInit || _buttonsInit) {
      return;
    }
    var clickfunc = function(e) {
      e.stopPropagation();
      $('#landingfileinput').click();
    };
    $('#landinguploadbutton').on('touchend click', clickfunc).removeClass('disabled');

    $('#landinguributton').click(OnURIClick);
    $('#landinguriinput').on('input', OnURIText).on('keypress', function(e) {
      if (e.originalEvent.key === 'Enter') {
        OnURIClick();
      }
    });

    // initialize the state of the button
    OnURIText(null);

    $('#launchbutton').click(function() {
      Hide();
    });
    var landTarget = document.getElementById('landingdroptarget');
    Showcase.SetupDropTarget(landTarget, landTarget,
      document.getElementById('landingdroptargeticons'), _openFunc, function() {
        _docIsIncoming = true;
        Hide();
      });
    _buttonsInit = true;
  }

  function OnURIClick() {
    if (!_uriEnabled) {
      return;
    }
    _docIsIncoming = true;
    var options = {
      pre_request_func: _preNetFunc,
      open_func: _openFunc,
      thumb_func: Showcase.OnThumbComplete,
      progress_func: Showcase.SetProgress
    };
    var uri = document.getElementById('landinguriinput').value;
    if (!/^(https?|ftp|file):\/\//.test(uri)) {
      uri = 'http://' + uri;
    }
    Showcase.docManager.CreateFromURI(uri, options);
  }

  function OnURIText(e) {
    var isOk = e !== null
      && /^((https?|ftp|file):\/\/)?[\w\d$-_.+!*'(),]+(:\d+\/)?[\w]\.[-A-Za-z0-9+&@#/%=~_|]+$/.test(e.target.value);
    var uriButtonSelector = $('#landinguributton');
    if (isOk) {
      uriButtonSelector.removeClass('disabled');
      _uriEnabled = true;
    } else {
      uriButtonSelector.addClass('disabled');
      _uriEnabled = false;
    }
  }

  function ToggleFeature(element) {
    var id = element.id;
    var currentVal = _checkboxes[id];
    var featName = id.slice(5, id.length);
    _checkboxes[id] = !currentVal;
    if (currentVal) {
      $('#' + id + ' .check')[0].innerHTML = '';
      $('svg .' + featName + '_line_color').addClass('fadeout');
      $('.' + featName + '_line_color + .overidable').addClass('fadeout_overide');
      if (featName === 'annots') {
        if (_checkboxes.featCollab) {
          ToggleFeature(document.getElementById('featCollab'));
          _checkboxes.featCollabUser = true;
        }
        _checkboxes.featAnnotsUser = false;
      } else if (featName === 'collab') {
        _checkboxes.featCollabUser = false;
        if (!_checkboxes.featAnnotsUser && _checkboxes.featAnnots) {
          ToggleFeature(document.getElementById('featAnnots'));
        }
      }
    } else {
      $('#' + id + ' .check')[0].innerHTML = '<i class="fa fa-check"></i>';
      $('svg .' + featName + '_line_color').removeClass('fadeout');
      $('.' + featName + '_line_color + .overidable').removeClass('fadeout_overide');
      if (featName === 'annots') {
        if (_checkboxes.featCollabUser && !_checkboxes.featCollab) {
          ToggleFeature(document.getElementById('featCollab'));
        }
        _checkboxes.featAnnotsUser = true;
      } else if (featName === 'collab') {
        if (!_checkboxes.featAnnots) {
          ToggleFeature(document.getElementById('featAnnots'));
          _checkboxes.featAnnotsUser = false;
        }
        _checkboxes.featCollabUser = true;
      }
    }
  }

  function CreateUsagePoller() {
    _usagePoller = setTimeout(UsagePollFunc, 2000);
  }

  function UsagePollFunc() {
    GetServerInfo(function(serverData) {
      ShowUsageData(serverData.usage);
      CreateUsagePoller();
    }, '?usage=true');
  }

  function ShowUsageData(usage) {
    var el = document.getElementById('info_process_load');
    if (el && usage.process_load) {
      var usageNum = Math.random() * 0.05 * usage.process_load + 0.95 * usage.process_load;
      el.innerHTML = (usageNum * 100).toFixed(3) + '%';
      $('#cpuusagebar').width((usageNum * 100).toFixed(1) + '%');
    }
    el = document.getElementById('info_mem_load');
    if (el && usage.phys_mem && usage.free_mem) {
      var memFracNum = (usage.phys_mem - usage.free_mem) / usage.phys_mem;
      el.innerHTML = ((usage.phys_mem - usage.free_mem) / 1024.0).toFixed(1) + 'GB / ' + ((usage.phys_mem) / 1024.0).toFixed(1) + 'GB';
      $('#memusagebar').width((memFracNum * 100).toFixed(1) + '%');
    }
  }

  function ShowServerData(sysInfo) {
    var el = document.getElementById('info_PDFNet_version');
    if (el && sysInfo.system.PDFNet_version) {
      el.innerHTML = sysInfo.system.PDFNet_version;
    }

    el = document.getElementById('info_server_version');
    if (el && sysInfo.system.server_version) {
      el.innerHTML = sysInfo.system.server_version;
    }

    el = document.getElementById('info_num_cpu');
    if (el && sysInfo.system.num_cpu) {
      el.innerHTML = '' + sysInfo.system.num_cpu;
    }

    el = document.getElementById('info_os_arch');
    if (el && sysInfo.system.os_arch) {
      el.innerHTML = sysInfo.system.os_arch;
    }

    el = document.getElementById('info_os_name');
    if (el && sysInfo.system.os_name) {
      el.innerHTML = sysInfo.system.os_name;
    }

    ShowUsageData(sysInfo.usage);
  }


  function GetServerInfo(callback, args) {
    args = args || '';
    $.ajax({
      type: 'GET',
      url: Utils.joinPaths(Showcase.apiRoot, 'SysInfo.jsp' + args),
      dataType: 'json',
      success: function(data) {
        callback(data);
      },
      error: function() {
        _logFunc('URI error!\n');
      }
    });
  }

  function ClickOutsideStandalone(e) {
    if (e.target && e.target.id && (e.target.id === 'landingcontainer')) {
      // will call Hide on it's own;
      LeaveStandalone();
    }
  }
  // called when clicking outside the dialog.
  function LeaveStandalone() {
    if (_shouldBackOut) {
      _shouldBackOut = false;
      history.back();
    } else {
      Hide();
    }
  }

  $('#landingpagebutton').click(function() {
    _checkboxes.isStandalone = true;
    history.pushState(JSON.parse(JSON.stringify(_checkboxes)), 'Settings Page', '?s');
    _shouldBackOut = true;
    Show(true);
    Showcase.viewerPage.toggleHamburger();
  });

  $('#closepanebutton').click(LeaveStandalone);


  $('div.menuselector, .topbar .setting-button, .topbar .title, #midbar_last').click(function(event) {
    SelectTab(event.currentTarget.id);
    Show(true);
  });

  exports.LandingPage = {
    Show: Show,
    Hide: Hide,
    EnableButtons: EnableButtons
  };
})(window);