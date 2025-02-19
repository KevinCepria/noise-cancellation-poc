// Helper function to write strings to DataView
const writeString = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

export const int16ToWavBuffer = (
  samples: Int16Array,
  numChannels = 1,
  targetSampleRate = 16000
) => {
  // Each sample is 2 bytes, and we add 44 bytes for the WAV header.
  const byteLength = samples.length * 2;
  const totalLength = 44 + byteLength;

  // Create an ArrayBuffer to hold the WAV file data.
  const wavBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(wavBuffer);

  // Write the WAV header.
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + byteLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, byteLength, true);

  // Write the PCM samples into the WAV buffer.
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  // Return a copy of the PCM data.
  const l16Buffer = new Int16Array(samples);

  return { wavBuffer, l16Buffer };
};
