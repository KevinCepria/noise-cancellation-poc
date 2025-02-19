import { useState, useRef } from "react";
import { AudioVisualizer } from "react-audio-visualize";
import {
  loadSpeex,
  SpeexWorkletNode,
  RnnoiseWorkletNode,
} from "@sapphi-red/web-noise-suppressor";
import speexWorkletPath from "@sapphi-red/web-noise-suppressor/speexWorklet.js?url";
import speexWasmPath from "@sapphi-red/web-noise-suppressor/speex.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import { KoalaWorker } from "@picovoice/koala-web";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";

import koalaModel from "./uitls/koala_params";
import { int16ToWavBuffer } from "./uitls/audio";

const App = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [speexAudioBlob, setSpeexAudioBlob] = useState<Blob | null>(null);
  const [rnnoiseAudioBlob, setRnnoiseAudioBlob] = useState<Blob | null>(null);
  const [rawAudioBlob, setRawAudioBlob] = useState<Blob | null>(null);
  const [koalaInitialized, setKoalaInitialized] = useState(false);
  const [koalaAudioBlob, setKoalaAudioBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessKey, setAccessKey] = useState("");

  const speexRecorderRef = useRef<MediaRecorder | null>(null);
  const rnnoiseRecorderRef = useRef<MediaRecorder | null>(null);
  const rawRecorderRef = useRef<MediaRecorder | null>(null);
  const koalaRef = useRef<KoalaWorker | null>(null);

  const speexChunksRef = useRef<Blob[]>([]);
  const rnnoiseChunksRef = useRef<Blob[]>([]);
  const rawChunksRef = useRef<Blob[]>([]);
  const koalaOutputFramesRef = useRef<Int16Array[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speexNodeRef = useRef<SpeexWorkletNode | null>(null);
  const rnnoiseNodeRef = useRef<RnnoiseWorkletNode | null>(null);

  // Initialize Koala with the provided access key.
  const initializeKoala = async () => {
    if (koalaInitialized) return;
    setLoading(true);
    try {
      const processCallback = (enhancedPcm: Int16Array) => {
        koalaOutputFramesRef.current.push(enhancedPcm);
      };

      const processErrorCallback = (error: Error) => {
        console.error(error);
      };

      koalaRef.current = await KoalaWorker.create(
        accessKey,
        processCallback,
        { base64: koalaModel },
        { processErrorCallback }
      );

      setKoalaInitialized(true);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      if (!koalaRef.current) throw new Error("Koala is not initialized!");

      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Capture raw audio
      rawRecorderRef.current = new MediaRecorder(stream);
      rawRecorderRef.current.ondataavailable = (event) => {
        rawChunksRef.current.push(event.data);
      };

      // Setup AudioContext
      audioContextRef.current = new AudioContext();
      sourceNodeRef.current =
        audioContextRef.current.createMediaStreamSource(stream);

      // Load Speex WASM binary and processor
      const speexWasmBinary = await loadSpeex({ url: speexWasmPath });
      await audioContextRef.current.audioWorklet.addModule(speexWorkletPath);
      speexNodeRef.current = new SpeexWorkletNode(audioContextRef.current, {
        wasmBinary: speexWasmBinary,
        maxChannels: 1,
      });
      sourceNodeRef.current.connect(speexNodeRef.current);

      // Create stream for Speex processed audio
      const speexProcessedStream =
        audioContextRef.current.createMediaStreamDestination();
      speexNodeRef.current.connect(speexProcessedStream);

      // Capture Speex processed audio
      speexRecorderRef.current = new MediaRecorder(speexProcessedStream.stream);
      speexRecorderRef.current.ondataavailable = (event) => {
        speexChunksRef.current.push(event.data);
      };

      // Load RNNoise WASM binary and processor
      const rnnoiseWasmBinary = await loadSpeex({ url: rnnoiseWasmPath });
      await audioContextRef.current.audioWorklet.addModule(rnnoiseWorkletPath);
      rnnoiseNodeRef.current = new RnnoiseWorkletNode(audioContextRef.current, {
        wasmBinary: rnnoiseWasmBinary,
        maxChannels: 1,
      });
      sourceNodeRef.current.connect(rnnoiseNodeRef.current);

      // Create stream for RNNoise processed audio
      const rnnoiseProcessedStream =
        audioContextRef.current.createMediaStreamDestination();
      rnnoiseNodeRef.current.connect(rnnoiseProcessedStream);

      // Capture RNNoise processed audio
      rnnoiseRecorderRef.current = new MediaRecorder(
        rnnoiseProcessedStream.stream
      );
      rnnoiseRecorderRef.current.ondataavailable = (event) => {
        rnnoiseChunksRef.current.push(event.data);
      };

      // Handle processed audio Blobs on recording stop
      speexRecorderRef.current.onstop = () => {
        setSpeexAudioBlob(
          new Blob(speexChunksRef.current, { type: "audio/wav" })
        );
        speexChunksRef.current = [];
      };

      rnnoiseRecorderRef.current.onstop = () => {
        setRnnoiseAudioBlob(
          new Blob(rnnoiseChunksRef.current, { type: "audio/wav" })
        );
        rnnoiseChunksRef.current = [];
      };

      rawRecorderRef.current.onstop = () => {
        setRawAudioBlob(new Blob(rawChunksRef.current, { type: "audio/wav" }));
        rawChunksRef.current = [];
      };
      //koala pre recording preparations
      koalaOutputFramesRef.current = [];
      WebVoiceProcessor.setOptions({
        frameLength: koalaRef.current.frameLength,
      });

      // Start recording
      await WebVoiceProcessor.subscribe([koalaRef.current]);

      rawRecorderRef.current.start();
      speexRecorderRef.current.start();
      rnnoiseRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const stopRecording = async () => {
    if (
      speexRecorderRef.current &&
      speexRecorderRef.current.state !== "inactive"
    ) {
      speexRecorderRef.current.stop();
    }
    if (
      rnnoiseRecorderRef.current &&
      rnnoiseRecorderRef.current.state !== "inactive"
    ) {
      rnnoiseRecorderRef.current.stop();
    }
    if (rawRecorderRef.current && rawRecorderRef.current.state !== "inactive") {
      rawRecorderRef.current.stop();
    }

    if (koalaRef.current) {
      await WebVoiceProcessor.unsubscribe([koalaRef.current]);
    }
    setIsRecording(false);

    //get processed Koala audio
    const enhancedPcm = mergeFrames(
      koalaOutputFramesRef.current,
      koalaRef.current?.delaySample || 0
    );

    const { wavBuffer: koalaWavBuffer } = int16ToWavBuffer(enhancedPcm);
    setKoalaAudioBlob(new Blob([koalaWavBuffer], { type: "audio/wav" }));

    // Cleanup
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (speexNodeRef.current) {
      speexNodeRef.current.disconnect();
      speexNodeRef.current = null;
    }
    if (rnnoiseNodeRef.current) {
      rnnoiseNodeRef.current.disconnect();
      rnnoiseNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
  };

  // Merge an array of frames into one continuous Int16Array.
  const mergeFrames = (frames: Int16Array[], delaySample = 0): Int16Array => {
    if (!koalaRef.current) return new Int16Array();
    const frameLength = koalaRef.current.frameLength;
    const pcm = new Int16Array(frames.length * frameLength);
    let delay = 0;

    frames.forEach((frame, index) => {
      if (index * frameLength < delaySample) {
        delay += 1;
      } else {
        pcm.set(frame, (index - delay) * frameLength);
      }
    });

    return pcm;
  };

  return (
    <div className="container">
      {!koalaInitialized ? (
        <div className="container">
          <div>
            <label>
              PicoVoice Access Key: &nbsp;
              <input
                type="text"
                onChange={(e) => setAccessKey(e.target.value)}
                value={accessKey}
              />
            </label>
          </div>
          <button
            disabled={loading || !accessKey}
            onClick={() => initializeKoala()}
          >
            Initialize Koala
          </button>
        </div>
      ) : (
        <>
          <button onClick={isRecording ? stopRecording : startRecording}>
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>

          {rawAudioBlob && (
            <div>
              <h2>Raw Audio</h2>
              <audio src={URL.createObjectURL(rawAudioBlob)} controls />
              <AudioVisualizer
                blob={rawAudioBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
            </div>
          )}

          {speexAudioBlob && (
            <div>
              <h2>(Speex)Noise-Canceled Audio</h2>
              <audio src={URL.createObjectURL(speexAudioBlob)} controls />
              <AudioVisualizer
                blob={speexAudioBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
            </div>
          )}

          {rnnoiseAudioBlob && (
            <div>
              <h2>(Rnnoise) Noise-Canceled Audio</h2>
              <audio src={URL.createObjectURL(rnnoiseAudioBlob)} controls />
              <AudioVisualizer
                blob={rnnoiseAudioBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
            </div>
          )}
          {koalaAudioBlob && (
            <div>
              <h2>(PicoVoice Koala) Noise-Canceled Audio</h2>
              <audio src={URL.createObjectURL(koalaAudioBlob)} controls />
              <AudioVisualizer
                blob={koalaAudioBlob}
                width={500}
                height={75}
                barWidth={1}
                gap={0}
                barColor={"#f76565"}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;
