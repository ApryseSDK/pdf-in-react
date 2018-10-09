/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */

(function() {
  //= ========================================================
  // Add a button with a dropdown menu to the toolbar
  //= ========================================================
  $('<ul>').addClass('ui-widget ui-menu-dropdown').attr('id', 'optionsMenuList').hide()
    .append("<li data-lang='en'><a href=\"javascript:void(0)\">English</a></li>")
    .append("<li data-lang='fr'><a href=\"javascript:void(0)\">Français</a></li>")
    .append("<li data-lang='de'><a href=\"javascript:void(0)\">Deutsche</a></li>")
    .append("<li data-lang='ru'><a href=\"javascript:void(0)\">Русский</a></li>")
    .append("<li data-lang='pt_br'><a href=\"javascript:void(0)\">Português Brasileiro</a></li>")
    .append("<li data-lang='es'><a href=\"javascript:void(0)\">Español</a></li>")
    .append("<li data-lang='gl'><a href=\"javascript:void(0)\">Galego</a></li>")
    .menu({
      select: function(event, ui) {
        var languageCode = $(ui.item).data('lang');

        i18n.setLng(languageCode, function() {
          $('body').i18n();
        });
      }
    })
    .appendTo('body');

  var rightAlignedElements = $('#control .right-aligned');
  var container = $('<div>').addClass('group');
  rightAlignedElements.prepend(container);

  var button = $('<span>')
    .addClass('glyphicons flag')
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

  container.append(button);
})();