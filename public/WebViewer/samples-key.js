window.sampleL = ''; // enter your key here so that the samples will run


if (!window.sampleL) {
  window.sampleL = localStorage.getItem('webviewer-samples-key');
  if (!window.sampleL) {
    var queryString = window.location.search.substring(1);
    var fieldValPairs = queryString.split('&');

    var isXod = false;
    for (var i = 0; i < fieldValPairs.length; i++) {
      var fieldVal = fieldValPairs[i].split('=');
      if (fieldVal[0] === 'doctype' && fieldVal[1] === 'xod') {
        isXod = true;
        break;
      }
    }

    if (!isXod) {
      window.sampleL = window.prompt('No license key is specified.\nPlease enter your key here or add it to samples-key.js inside the WebViewer folder.', '');
      if (window.sampleL) {
        localStorage.setItem('webviewer-samples-key', window.sampleL);
      }
    }
  }
}