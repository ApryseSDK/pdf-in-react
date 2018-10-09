(function() {
  // adds custom styles to certain widget types
  Annotations.WidgetAnnotation.getCustomStyles = function(widget) {
    if (widget instanceof Annotations.TextWidgetAnnotation) {
      // can check widget properties
      if (widget.fieldName === 'f1-1') {
        return {
          'background-color': 'lightgreen'
        };
      }
      return {
        'background-color': 'lightblue',
        color: 'brown'
      };
    } else if (widget instanceof Annotations.PushButtonWidgetAnnotation) {
      return {
        'background-color': 'black',
        color: 'white'
      };
    } else if (widget instanceof Annotations.CheckButtonWidgetAnnotation) {
      return {
        'background-color': 'lightgray',
        opacity: 0.8
      };
    }
  };

  function createXElement() {
    return $('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 1000 1000" enable-background="new 0 0 1000 1000" xml:space="preserve">'
            + '<g><path d="M500,623.8L159.9,963.9c-34.6,34.6-90.1,34.7-124.3,0.5c-34.4-34.4-34-89.8,0.5-124.3L376.2,500L36.1,159.9C1.5,125.3,1.4,69.8,35.6,35.6c34.4-34.4,89.8-34,124.3,'
            + '0.5L500,376.2L840.1,36.1c34.6-34.6,90.1-34.7,124.3-0.5c34.4,34.4,34,89.8-0.5,124.3L623.8,500l340.1,340.1c34.6,34.6,34.7,90.1,0.5,124.3c-34.4,34.4-89.8,34-124.3-0.5L500,623.8z"/></g>'
            + '</svg>')
      .css({
        width: '100%',
        height: '100%'
      });
  }

  function updateValue(widget) {
    if (widget.innerElement) {
      if (!widget.xEle) {
        widget.xEle = createXElement();
      }

      var isChecked = widget.getValue() !== 'Off';
      if (isChecked) {
        widget.innerElement.append(widget.xEle);
      } else {
        widget.xEle.remove();
      }
    }
  }

  // overrides default checkbox element
  Annotations.CheckButtonWidgetAnnotation.prototype.createInnerElement = function() {
    var me = this;

    var el = $('<div/>');
    el.on('click', function() {
      me.trigger('click');
    });

    return el;
  };

  var refresh = Annotations.CheckButtonWidgetAnnotation.prototype.refresh;
  Annotations.CheckButtonWidgetAnnotation.prototype.refresh = function() {
    refresh.apply(this, arguments);
    updateValue(this);
  };
})();