import { useState, useRef, useMemo } from "react";
import { AudioVisualizer, LiveAudioVisualizer } from "react-audio-visualize";
import { KoalaWorker } from "@picovoice/koala-web";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";

import koalaModel from "./uitls/koala_params";
import { int16ToWavBuffer } from "./uitls/audio";

const App = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [rawAudioBlob, setRawAudioBlob] = useState<Blob | null>(null);
  const [koalaInitialized, setKoalaInitialized] = useState(false);
  const [koalaAudioBlob, setKoalaAudioBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [processedRecorder, setProcessedRecorder] =
    useState<MediaRecorder | null>(null);
  const [rawRecorder, setRawRecorder] = useState<MediaRecorder | null>(null);

  // This destination node will let us capture processed audio as a MediaStream.
  const processedAudioDestinationRef =
    useRef<MediaStreamAudioDestinationNode | null>(null);
  const rawAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(
    null
  );

  const koalaRef = useRef<KoalaWorker | null>(null);
  const koalaOutputFramesRef = useRef<Int16Array[]>([]);
  const koalaInputFramesRef = useRef<Int16Array[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const recorderEngine = useMemo(
    () => ({
      onmessage: (event: MessageEvent) => {
        if (event.data.command === "process") {
          // Process and store raw audio frames
          koalaInputFramesRef.current.push(event.data.inputFrame as Int16Array);

          // Route raw audio to the visualization destination
          if (
            audioContextRef.current &&
            koalaRef.current &&
            rawAudioDestinationRef.current
          ) {
            const frame = event.data.inputFrame;
            const buffer = audioContextRef.current.createBuffer(
              1,
              frame.length,
              koalaRef.current.sampleRate
            );
            const floatData = new Float32Array(frame.length);
            for (let i = 0; i < frame.length; i++) {
              floatData[i] = frame[i] < 0 ? frame[i] / 32768 : frame[i] / 32767;
            }
            buffer.copyToChannel(floatData, 0);

            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(rawAudioDestinationRef.current);
            source.start();
          }
        }
      },
    }),
    []
  );

  // Initialize Koala with the provided access key.
  const initializeKoala = async () => {
    if (koalaInitialized) return;
    setLoading(true);
    try {
      const processCallback = (enhancedPcm: Int16Array) => {
        koalaOutputFramesRef.current.push(enhancedPcm);

        // Play the processed frame by routing it to both the speakers
        // and the media destination (for visualization)
        if (
          audioContextRef.current &&
          koalaRef.current &&
          processedAudioDestinationRef.current
        ) {
          const buffer = audioContextRef.current.createBuffer(
            1,
            enhancedPcm.length,
            koalaRef.current.sampleRate
          );
          const floatData = new Float32Array(enhancedPcm.length);
          for (let i = 0; i < enhancedPcm.length; i++) {
            floatData[i] =
              enhancedPcm[i] < 0
                ? enhancedPcm[i] / 32768
                : enhancedPcm[i] / 32767;
          }
          buffer.copyToChannel(floatData, 0);

          const source = audioContextRef.current.createBufferSource();
          source.buffer = buffer;
          // Connect to the MediaStream destination (for visualization)
          source.connect(processedAudioDestinationRef.current);
          source.start();
        }
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

      // Setup AudioContext
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });

      koalaOutputFramesRef.current = [];
      koalaInputFramesRef.current = [];

      WebVoiceProcessor.setOptions({
        frameLength: koalaRef.current.frameLength,
      });
      // Start recording
      await WebVoiceProcessor.subscribe([recorderEngine, koalaRef.current]);

      // Create a MediaStream destination node to capture processed audio.
      processedAudioDestinationRef.current =
        audioContextRef.current.createMediaStreamDestination();
      rawAudioDestinationRef.current =
        audioContextRef.current.createMediaStreamDestination();

      // Create a MediaRecorder from the destination's stream for visualization.
      const processedRecorder = new MediaRecorder(
        processedAudioDestinationRef.current.stream
      );
      const rawRecorder = new MediaRecorder(
        rawAudioDestinationRef.current.stream
      );

      processedRecorder.start(); // Start capturing audio data.
      rawRecorder.start();
      setProcessedRecorder(processedRecorder);
      setRawRecorder(rawRecorder);

      setIsRecording(true);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const stopRecording = async () => {
    if (koalaRef.current) {
      await WebVoiceProcessor.unsubscribe([recorderEngine, koalaRef.current]);
    }
    setIsRecording(false);

    // Stop the MediaRecorders before closing the AudioContext.
    if (processedRecorder) {
      processedRecorder.stop();
      processedRecorder.stream.getTracks().forEach((track) => track.stop());
      setProcessedRecorder(null);
    }
    if (rawRecorder) {
      rawRecorder.stop();
      rawRecorder.stream.getTracks().forEach((track) => track.stop());
      setRawRecorder(null);
    }

    // Disconnect Source nodes
    rawAudioDestinationRef.current?.disconnect();
    processedAudioDestinationRef.current?.disconnect();

    //get processed Koala audio
    const rawPcm = mergeFrames(koalaInputFramesRef.current);
    const enhancedPcm = mergeFrames(
      koalaOutputFramesRef.current,
      koalaRef.current?.delaySample || 0
    );

    const { wavBuffer: rawWavBuffer } = int16ToWavBuffer(rawPcm);
    const { wavBuffer: koalaWavBuffer } = int16ToWavBuffer(enhancedPcm);

    setKoalaAudioBlob(new Blob([koalaWavBuffer], { type: "audio/wav" }));
    setRawAudioBlob(new Blob([rawWavBuffer], { type: "audio/wav" }));

    // Cleanup
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
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

          {isRecording && processedRecorder && rawRecorder && (
            <>
              <div>
                <h2>Raw Audio</h2>
                <LiveAudioVisualizer
                  mediaRecorder={rawRecorder}
                  width={500}
                  height={150}
                />
              </div>
              <div>
                <h2>(PicoVoice Koala) Noise-Canceled Audio</h2>
                <LiveAudioVisualizer
                  mediaRecorder={processedRecorder}
                  width={500}
                  height={150}
                />
              </div>
            </>
          )}
          {!isRecording && (
            <>
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
        </>
      )}
    </div>
  );
};

export default App;
