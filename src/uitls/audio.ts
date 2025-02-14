export const convertToL16 = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Create OfflineAudioContext for resampling
  const offlineContext = new OfflineAudioContext({
    numberOfChannels: 1, // Mono
    length: Math.round(audioBuffer.duration * 16000), // Adjust length for 16kHz
    sampleRate: 16000, // Target sample rate
  });

  // Create buffer source
  const source = offlineContext.createBufferSource();
  const newBuffer = offlineContext.createBuffer(
    1,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  newBuffer.copyToChannel(audioBuffer.getChannelData(0), 0);

  source.buffer = newBuffer;
  source.connect(offlineContext.destination);
  source.start();

  // Render the new buffer
  const renderedBuffer = await offlineContext.startRendering();
  const pcmData = renderedBuffer.getChannelData(0);

  // Convert PCM to a Blob
  const l16Blob = new Blob([pcmData], { type: "audio/l16" });

  return l16Blob;
};
