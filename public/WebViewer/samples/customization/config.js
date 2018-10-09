/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */

(function() {
  //= ========================================================
  // Hide a UI component through ReaderControl.config
  //= ========================================================
  $.extend(ReaderControl.config, {
    // configuration options go here
    customScript: 'defaultScriptExtension.js',
    ui: {
      hideZoom: false
    }
  });

  //= ========================================================
  // Add a button to the toolbar
  //= ========================================================
  //  Add an about button to the tool bar that pops up
  //  a dialog with viewer branding and information.

  var rightAlignedElements = $('#control .right-aligned');
  var container = $('<div>').addClass('group');
  rightAlignedElements.append(container);

  var button = $('<span>').attr({
    'id': 'optionsButton',
    'class': 'glyphicons circle_info'
  })
    .on('click', function() {
      var message = '<div style="margin: 5px 0"><img src="//www.pdftron.com/assets/images/logos/pdftron_logo.gif"></div>';
      message += '<div>WebViewer HTML5 Version ' + readerControl.docViewer.version + '<br/><a href="http://www.pdftron.com" target="_blank">www.pdftron.com</a></div>';
      message += '<p>The ReaderControl is a full-featured and customizable web component extended from the PDFNet WebViewer library.</p>';


      $.alert(message, 'About ReaderControl');
    });

  container.append(button);


  //= ========================================================
  // Add a button with a dropdown menu to the toolbar
  //= ========================================================
  $('<ul>').addClass('ui-widget ui-menu-dropdown').attr('id', 'optionsMenuList').hide()
    .append('<li><a href="javascript:void(0)">Option 1</a></li>')
    .append('<li><a href="javascript:void(0)">Option 2</a></li>')
    .appendTo('body');


  var dropdownButtonContainer = $('<div>').addClass('group');
  rightAlignedElements.append(dropdownButtonContainer);

  var dropdownButton = $('<span>').attr({
    'id': 'dropdownButton',
    'class': 'glyphicons cogwheel'
  })
    .on('click', function() {
      var menu = $('#optionsMenuList');
      if (menu.data('isOpen')) {
        menu.hide();
        menu.data('isOpen', false);
      } else {
        menu.show().position({
          my: 'left top',
          at: 'left bottom',
          of: this,
          within: document.body
        });

        $(document).one('click', function() {
          menu.hide();
          menu.data('isOpen', false);
        });
        menu.data('isOpen', true);
      }
      return false;
    });

  dropdownButtonContainer.append(dropdownButton);

  //= ========================================================
  // Hide a button
  //= ========================================================
  $('#fullScreenButton').hide();


  //= ========================================================
  // Skip to page 3 on document load
  //= ========================================================
  $(document).bind('documentLoaded', function() {
    // document finished loading
    readerControl.setCurrentPageNumber(3);
  });

  $(document).bind('pageCompleted', function(event, pageNumber) {
    // a page has finished rendering
    console.log(pageNumber);
  });
})();