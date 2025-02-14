// noiseCancellationSetup.js

import speexWorkletPath from "@sapphi-red/web-noise-suppressor/speexWorklet.js?url";
import speexWasmPath from "@sapphi-red/web-noise-suppressor/speex.wasm?url";
import {
  loadSpeex,
  SpeexWorkletNode,
  loadRnnoise,
  RnnoiseWorkletNode,
  NoiseGateWorkletNode,
} from "@sapphi-red/web-noise-suppressor";

let speexWasmBinary: ArrayBuffer;
let isInitialized = false;

export const initializeNoiseCancellation = async () => {
  if (isInitialized) return;

  // Load the WASM binary
  speexWasmBinary = await loadSpeex({
    url: speexWasmPath,
  });

  isInitialized = true;
  console.log("Noise cancellation initialized");
};

export const createSpeexNode = (audioCtx: OfflineAudioContext) => {
  if (!isInitialized) {
    throw new Error(
      "Noise cancellation not initialized. Call initializeNoiseCancellation first."
    );
  }

  // Create and return a new SpeexWorkletNode
  return new SpeexWorkletNode(audioCtx, {
    wasmBinary: speexWasmBinary,
    maxChannels: 2, // Adjust based on your needs
  });
};
