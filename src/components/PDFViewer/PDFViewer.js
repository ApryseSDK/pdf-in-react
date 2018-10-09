import React from 'react';

export default class PDFViewer extends React.Component {

  constructor(props) {
    super(props);
    this.viewerRef = React.createRef();
    this.backend = new props.backend();
  }

  componentDidMount() {
    const { src } = this.props;
    const element = this.viewerRef.current;
    this.backend.init(src, element);
  }

  rotate = (direction) => {
    if (this.backend.rotate) {
      this.backend.rotate(direction);
    }
  }
  

  render() {
    return (
      <div ref={this.viewerRef} id='viewer' style={{ width: '100%', height: '100%' }}>

      </div>
    )
  }
}