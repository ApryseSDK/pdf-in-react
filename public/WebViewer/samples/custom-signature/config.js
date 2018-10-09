(function() {
  // override the drawing of the background of the signature canvas
  Tools.SignatureCreateTool.prototype.drawBackground = function() {
    // scale for retina displays
    var multiplier = window.utils.getCanvasMultiplier();
    this.ctx.scale(multiplier, multiplier);

    var lineY = this.ctx.canvas.height * 0.5 / multiplier;
    this.ctx.strokeStyle = '#0000FF';
    this.ctx.lineCap = 'round';
    this.ctx.lineWidth = 6;
    this.ctx.beginPath();
    this.ctx.moveTo(10, lineY);
    this.ctx.lineTo(this.ctx.canvas.width / multiplier - 10, lineY);
    this.ctx.stroke();

    this.ctx.fillStyle = '#FF0000';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.font = '15px Times New Roman';
    this.ctx.fillText('This is a custom signature background', this.ctx.canvas.width / multiplier / 2, lineY - 20);
    this.ctx.restore();
  };

  var initAnnot = Tools.SignatureCreateTool.prototype.initAnnot;
  Tools.SignatureCreateTool.prototype.initAnnot = function() {
    // changes the signature's stroke color to orange
    initAnnot.apply(this, arguments);
    this.freeHandAnnot.StrokeColor = new Annotations.Color(255, 165, 0);
  };

  $(document).on('viewerLoaded', function() {
    // an example of storing the default signature information in localStorage
    // if you store a signature as default and then refresh the sample the signature you saved will exist as the default
    var signatureTool = readerControl.toolModeMap['AnnotationCreateSignature'];
    if (localStorage.defaultSignature) {
      signatureTool.initDefaultSignature(JSON.parse(localStorage.defaultSignature));
    }

    signatureTool.on('saveDefault', function(e, paths) {
      // when the user saves a signature as the default persist the information to localStorage
      localStorage.defaultSignature = JSON.stringify(paths);
    });
  });

  $(document).on('documentLoaded', function() {
    readerControl.setToolMode('AnnotationCreateSignature');
  });
})();