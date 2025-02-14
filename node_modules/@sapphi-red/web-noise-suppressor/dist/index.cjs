"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  NoiseGateWorkletNode: () => NoiseGateWorkletNode,
  RnnoiseWorkletNode: () => RnnoiseWorkletNode,
  SpeexWorkletNode: () => SpeexWorkletNode,
  loadRnnoise: () => loadRnnoise,
  loadSpeex: () => loadSpeex
});
module.exports = __toCommonJS(src_exports);

// src/noiseGate/workletUtil.ts
var id = "@sapphi-red/web-noise-suppressor/noise-gate";

// src/noiseGate/workletNode.ts
var NoiseGateWorkletNode = class extends AudioWorkletNode {
  constructor(context, {
    openThreshold,
    closeThreshold = openThreshold,
    holdMs,
    maxChannels
  }) {
    const workletOptions = {
      processorOptions: { openThreshold, closeThreshold, holdMs, maxChannels }
    };
    super(context, id, workletOptions);
  }
};

// node_modules/.pnpm/wasm-feature-detect@1.6.1/node_modules/wasm-feature-detect/dist/esm/index.js
var simd = async () => WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));

// src/utils/fetchArrayBuffer.ts
var fetchArrayBuffer = async (url, init) => {
  const res = await fetch(url, init);
  const result = await res.arrayBuffer();
  return result;
};

// src/rnnoise/load.ts
var loadRnnoise = async ({ url, simdUrl }, init) => {
  const loadUrl = await simd() ? simdUrl : url;
  const binary = await fetchArrayBuffer(loadUrl, init);
  return binary;
};

// src/rnnoise/workletUtil.ts
var id2 = "@sapphi-red/web-noise-suppressor/rnnoise";

// src/rnnoise/workletNode.ts
var RnnoiseWorkletNode = class extends AudioWorkletNode {
  constructor(context, { maxChannels, wasmBinary }) {
    const workletOptions = {
      processorOptions: { maxChannels, wasmBinary }
    };
    super(context, id2, workletOptions);
  }
  destroy() {
    this.port.postMessage("destroy");
  }
};

// src/speex/load.ts
var loadSpeex = async ({ url }, init) => {
  const binary = await fetchArrayBuffer(url, init);
  return binary;
};

// src/speex/workletUtil.ts
var id3 = "@sapphi-red/web-noise-suppressor/speex";

// src/speex/workletNode.ts
var SpeexWorkletNode = class extends AudioWorkletNode {
  constructor(context, { maxChannels, wasmBinary }) {
    const workletOptions = {
      processorOptions: { maxChannels, wasmBinary }
    };
    super(context, id3, workletOptions);
  }
  destroy() {
    this.port.postMessage("destroy");
  }
};
//# sourceMappingURL=index.cjs.map