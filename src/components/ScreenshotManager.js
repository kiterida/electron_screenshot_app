// src/components/ScreenshotManager.js
import React from 'react';

const ScreenshotManager = ({ videoRef, videoPath }) => {
  const handleScreenshot = async () => {
    if (!videoRef || !videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const buffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    const folder = await window.electronAPI.getScreenshotFolder(videoPath);
    if (!folder) return alert('Could not determine screenshot folder.');

    const filename = `screenshot_${Date.now()}.png`;

    // Save the image using Node.js fs from the main process or preload if needed.
    // You could also send this via ipcRenderer to save it in the main process.
    const { writeFile } = window.require('fs');
    const path = window.require('path');
    const outputPath = path.join(folder, filename);
    writeFile(outputPath, uint8Array, (err) => {
      if (err) alert('Failed to save screenshot');
      else alert(`Saved to ${outputPath}`);
    });
  };

  return (
    <button onClick={handleScreenshot}>Take Screenshot</button>
  );
};

export default ScreenshotManager;
