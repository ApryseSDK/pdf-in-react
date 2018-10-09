(function() {
  function CreateColorTheme(themeColor, backgroundColor, highlightColor) {
    var style = document.getElementById('colorthemestyle');
    style.innerHTML = '.glyphicons:before {color: ' + themeColor + ' !important;}' +
      '.glyphicons:hover:before, .glyphicons.active:before {' +
      'color: ' + themeColor + ' !important;}.toggleControl span.active {' +
      'background-color: ' + backgroundColor + ' !important;} ' +
      '.toolbar .glyphicons.select .svg polygon {fill: ' + themeColor +
      ';} .toolbar .glyphicons.select:hover .svg polygon,' +
      '.toolbar .glyphicons.select.active .svg polygon {fill: ' + highlightColor +
      ';} .glyphicons:hover:before, .glyphicons.active:before {color:' +
      highlightColor + ' !important;} .labelled-button-row:hover {color: ' + highlightColor +
      '; border-bottom: 2px solid ' + highlightColor + ';}.labelled-button-row:hover ' +
      'span{color: ' + highlightColor + ';} .labelled-button-row:hover ' +
      '.glyphicons:before{color: ' + highlightColor + ' !important;}';
  }

  function InitWVFrame() {
    var cssLink = document.createElement('link');
    cssLink.href = '../../samples/office/OfficeDemo.css';
    cssLink.rel = 'stylesheet';
    cssLink.type = 'text/css';

    document.head.appendChild(cssLink);

    var style = document.createElement('style');
    style.setAttribute('id', 'colorthemestyle');
    style.type = 'text/css';
    document.head.appendChild(style);

    CreateColorTheme('#B7B7B7', '#F1F1F1', '#DCDCDC');
  }

  function SetPowerpointTheme() {
    CreateColorTheme('#B7472A', '#F1F1F1', '#DC5939');
  }

  function SetWordTheme() {
    CreateColorTheme('#2A579A', '#F1F1F1', '#4D82B8');
  }

  function SetExcelTheme() {
    CreateColorTheme('#217346', '#F1F1F1', '#439467');
  }

  function SetPDFTheme() {
    CreateColorTheme('#4E291E', '#F1F1F1', '#FF3500');
  }

  function SetNeutralTheme() {
    CreateColorTheme('#444444', '#F1F1F1', '#ECDF78');
  }

  $(document).on('documentLoaded', function() {
    if (readerControl.filename) {
      var matches = readerControl.filename.toLowerCase().match(/\.\w+$/);
      if (matches.length > 0) {
        switch (matches[0]) {
          case '.docx':
            SetWordTheme();
            break;
          case '.pptx':
            SetPowerpointTheme();
            break;
          case '.xlsx':
            SetExcelTheme();
            break;
          case '.pdf':
            SetPDFTheme();
            break;
          default:
            SetNeutralTheme();
            break;
        }
      }
    }
  });

  InitWVFrame();

  // this is an office only demo so disable PDF extensions
  ReaderControl.prototype.supportedPDFExtensions = [];
})();

