(function(exports) {
  exports.authors = {};
  exports.Utils = {};

  var globalTimer = {
    start: window.performance.timing.fetchStart,
    times: []
  };

  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(search, pos) {
      return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    };
  }

  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(search, thisLen) {
      if (thisLen === undefined || thisLen > this.length) {
        thisLen = this.length;
      }
      return this.substring(thisLen - search.length, thisLen) === search;
    };
  }

  exports.Utils.isIEBrowser = function() {
    var ua = window.navigator.userAgent;
    var msie = ua.indexOf('MSIE ');
    return msie >= 0 || ua.indexOf('Trident') >= 0;
  };

  exports.Utils.joinPaths = function() {
    var lhs, rhs;
    var arr = [];
    arr[arguments.length - 1] = null;
    var i = 0;
    if (arguments.length > 0) {
      rhs = arguments[i].endsWith('/') ? arguments[i].length - 1 : arguments[i].length;
      arr[i] = arguments[i].substring(0, rhs);
    }
    for (i = 1; i < arguments.length - 1; ++i) {
      lhs = arguments[i].startsWith('/') ? 1 : 0;
      rhs = arguments[i].endsWith('/') ? arguments[i].length - 1 : arguments[i].length;
      arr[i] = arguments[i].substring(lhs, rhs);
    }
    if (arguments.length > 1) {
      lhs = arguments[i].startsWith('/') ? 1 : 0;
      arr[i] = arguments[i].substring(lhs, arguments[i].length);
    }
    return arr.join('/');
  };

  exports.Utils.RestartTimer = function() {
    globalTimer.times = [];
    globalTimer.start = Date.now();
  };

  exports.Utils.MarkTime = function(label) {
    var time = Date.now();
    var timersLength = globalTimer.times.length;
    var last = globalTimer.start;

    if (timersLength > 0) {
      last = globalTimer.times[timersLength - 1].time;
    }

    globalTimer.times.push({ label: label, time: time });
    console.log(label, ': ', (time - last));
  };

  exports.Utils.MarkTime('Timer init');

  exports.Utils.PrintTimes = function() {
    var strArray = [];
    var firstTime = globalTimer.start;
    var dif = 0;
    var last = 0;
    for (var i = 0; i < globalTimer.times.length; i++) {
      dif = globalTimer.times[i].time - firstTime;

      strArray.push('<span>');
      strArray.push(globalTimer.times[i].label);
      strArray.push(': ');
      strArray.push('' + dif);
      strArray.push('ms (+' + (dif - last));
      strArray.push(')</span><br>');
      last = dif;
    }
    document.getElementById('timeoverlay').innerHTML = strArray.join('');
  };

  // polyfill for element.isConnected
  (function(supported) {
    if (supported) {
      return;
    }
    Object.defineProperty(window.Node.prototype, 'isConnected', {
      get: function() {
        return document.body.contains(this);
      }
    });
  })('isConnected' in window.Node.prototype);

  exports.Utils.GetQueryVariable = function(a) {
    var b = window.location.search.substring(1);
    var c = b.split('&');
    for (var d = 0; d < c.length; d++) {
      var e = c[d].split('=');
      if (e[0] === a) {
        return e.length > 1 ? e[1] : true;
      }
    }
    return null;
  };

  exports.Utils.DoLog = function(thing) {
    console.log(thing);
  };

  var key = exports.Utils.GetQueryVariable('key');
  if (key) {
    window.localStorage.setItem('webviewer-samples-key', key);
  }
})(window);