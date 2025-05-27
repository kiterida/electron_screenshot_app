// src/components/MediaPlayer.js
import React, { useRef } from 'react';

const MediaPlayer = ({ videoPath, onVideoRef }) => {
  const videoRef = useRef(null);

  // Allow parent to access the video DOM node
  React.useEffect(() => {
    if (onVideoRef && videoRef.current) {
      onVideoRef(videoRef.current);
    }
  }, [videoRef.current]);

  return (
    <video
      ref={videoRef}
      src={videoPath ? `file://${videoPath}` : ''}
      controls
      style={{ width: '100%', maxHeight: '500px' }}
    />
  );
};

export default MediaPlayer;
