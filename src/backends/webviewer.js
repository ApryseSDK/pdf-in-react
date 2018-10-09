export default class PDFTron {
  init = (source, element) => {
    this.viewer = new window.PDFTron.WebViewer({
      path: '/WebViewer/lib',
      l: 'YOUR_KEY_HERE',
      initialDoc: source,
    }, element);
  }


  rotate = (direction) => {
    if(direction === 'clockwise') {
      this.viewer.rotateClockwise();
    } else {
      this.viewer.rotateCounterClockwise();
    }
  }
}