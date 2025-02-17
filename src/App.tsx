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

const App = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [speexAudioBlob, setSpeexAudioBlob] = useState<Blob | null>(null);
  const [rnnoiseAudioBlob, setRnnoiseAudioBlob] = useState<Blob | null>(null);
  const [rawAudioBlob, setRawAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const rnnoiseRecorderRef = useRef<MediaRecorder | null>(null);
  const rawRecorderRef = useRef<MediaRecorder | null>(null);
  const speexChunksRef = useRef<Blob[]>([]);
  const rnnoiseChunksRef = useRef<Blob[]>([]);
  const rawChunksRef = useRef<Blob[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speexNodeRef = useRef<SpeexWorkletNode | null>(null);
  const rnnoiseNodeRef = useRef<RnnoiseWorkletNode | null>(null);

  const startRecording = async () => {
    try {
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
      mediaRecorderRef.current = new MediaRecorder(speexProcessedStream.stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
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
      mediaRecorderRef.current.onstop = () => {
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

      // Start recording
      rawRecorderRef.current.start();
      mediaRecorderRef.current.start();
      rnnoiseRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
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
    setIsRecording(false);

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

  return (
    <div className="container">
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
    </div>
  );
};

export default App;
