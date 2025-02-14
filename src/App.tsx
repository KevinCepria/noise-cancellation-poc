import { useState, useRef } from "react";
import { AudioVisualizer } from "react-audio-visualize";
import { loadSpeex, SpeexWorkletNode } from "@sapphi-red/web-noise-suppressor";
import speexWorkletPath from "@sapphi-red/web-noise-suppressor/speexWorklet.js?url";
import speexWasmPath from "@sapphi-red/web-noise-suppressor/speex.wasm?url";

const App = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [processedAudioBlob, setProcessedAudioBlob] = useState<Blob | null>(
    null
  );
  const [rawAudioBlob, setRawAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const rawRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const rawChunksRef = useRef<Blob[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speexNodeRef = useRef<SpeexWorkletNode | null>(null);

  const startRecording = async () => {
    try {
      //Get Meida steam
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

      // Setup AudioContext for processing
      audioContextRef.current = new AudioContext();
      sourceNodeRef.current =
        audioContextRef.current.createMediaStreamSource(stream);

      // Load Speex WASM binary
      const speexWasmBinary = await loadSpeex({ url: speexWasmPath });

      // Load the Speex audio worklet processor
      await audioContextRef.current.audioWorklet.addModule(speexWorkletPath);

      // Create SpeexWorkletNode
      speexNodeRef.current = new SpeexWorkletNode(audioContextRef.current, {
        wasmBinary: speexWasmBinary,
        maxChannels: 1, // Mono audio
      });

      // Connect nodes: source -> speexNode (NO playback)
      sourceNodeRef.current.connect(speexNodeRef.current);

      // Create a new MediaStream for processed audio
      const processedStream =
        audioContextRef.current.createMediaStreamDestination();
      speexNodeRef.current.connect(processedStream);

      // Capture processed (noise-canceled) audio
      mediaRecorderRef.current = new MediaRecorder(processedStream.stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      // Handle processed audio Blob on recording stop
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        setProcessedAudioBlob(audioBlob);
        audioChunksRef.current = [];
      };

      // Handle raw audio Blob on recording stop
      rawRecorderRef.current.onstop = () => {
        const rawBlob = new Blob(rawChunksRef.current, { type: "audio/wav" });
        setRawAudioBlob(rawBlob);
        rawChunksRef.current = [];
      };

      // Start recording both raw and processed audio
      rawRecorderRef.current.start();
      mediaRecorderRef.current.start();
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
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Stop microphone stream
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
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

      {processedAudioBlob && (
        <div>
          <h2>Noise-Canceled Audio</h2>
          <audio src={URL.createObjectURL(processedAudioBlob)} controls />
          <AudioVisualizer
            blob={processedAudioBlob}
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
