import React, { useState, useRef } from "react";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";
import { KoalaWorker } from "@picovoice/koala-web";
import koalaModel from "./uitls/koala_params";
import { AudioVisualizer } from "react-audio-visualize";

import { int16ToWavBuffer } from "./uitls/audio";

const KoalaNoiseSuppression: React.FC = () => {
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [koalaInitialized, setKoalaInitialized] = useState(false);
  const [koalaAudioBlob, setKoalaAudioBlob] = useState<Blob | null>(null);
  const [rawAudioBlob, setRawAudioBlob] = useState<Blob | null>(null);

  const koalaRef = useRef<KoalaWorker | null>(null);
  const audioDataRef = useRef<Int16Array[]>([]);
  const outputFramesRef = useRef<Int16Array[]>([]);

  // Initialize Koala with the provided access key.
  const initializeKoala = async (accessKey: string): Promise<void> => {
    if (koalaInitialized) return;
    setLoading(true);
    try {
      const processCallback = (enhancedPcm: Int16Array) => {
        outputFramesRef.current.push(enhancedPcm);
      };

      const processErrorCallback = (error: Error) => {
        console.error(error);
        setError(`Error: ${error.message}`);
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
      setError(`Initialization failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Start recording audio.
  const startRecording = async (): Promise<void> => {
    if (!koalaRef.current) {
      setError("Koala is not initialized.");
      return;
    }

    setIsRecording(true);

    audioDataRef.current = [];
    outputFramesRef.current = [];

    // Define a recorder engine to collect audio frames.
    const recorderEngine = {
      onmessage: (event: MessageEvent) => {
        if (event.data.command === "process") {
          // Assume event.data.inputFrame is an Int16Array.
          audioDataRef.current.push(event.data.inputFrame as Int16Array);
        }
      },
    };

    WebVoiceProcessor.setOptions({ frameLength: koalaRef.current.frameLength });
    await WebVoiceProcessor.subscribe([recorderEngine, koalaRef.current]);
  };

  // Stop recording and process the captured frames.
  const stopRecording = async (): Promise<void> => {
    setIsRecording(false);

    if (koalaRef.current) {
      await WebVoiceProcessor.unsubscribe([koalaRef.current]);
    }

    const rawPcm = mergeFrames(audioDataRef.current);
    const enhancedPcm = mergeFrames(
      outputFramesRef.current,
      koalaRef.current?.delaySample || 0
    );
    const { wavBuffer: rawWavBuffer } = int16ToWavBuffer(rawPcm);
    const { wavBuffer: koalaWavBuffer } = int16ToWavBuffer(enhancedPcm);

    setKoalaAudioBlob(new Blob([koalaWavBuffer], { type: "audio/wav" }));
    setRawAudioBlob(new Blob([rawWavBuffer], { type: "audio/wav" }));
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
    <div>
      <h1>Koala Noise Suppression Demo</h1>
      <div>
        <label>
          Access Key:
          <input
            type="text"
            id="accessKey"
            defaultValue="YOUR_ACCESS_KEY_HERE"
          />
        </label>
        <button
          disabled={koalaInitialized || loading}
          onClick={() =>
            initializeKoala(
              (document.getElementById("accessKey") as HTMLInputElement).value
            )
          }
        >
          Initialize Koala
        </button>
      </div>
      {koalaInitialized && (
        <div>
          <div>
            <button onClick={isRecording ? stopRecording : startRecording}>
              {isRecording ? "Stop" : "Start"} Recording
            </button>
          </div>
          {error && (
            <div>
              <p>Status: {error}</p>
            </div>
          )}
        </div>
      )}
      {!isRecording && rawAudioBlob && koalaAudioBlob && (
        <div>
          <div>
            <h2>Original Recording</h2>
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
          <div>
            <h2>Processed Recording (Koala)</h2>
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
        </div>
      )}
    </div>
  );
};

export default KoalaNoiseSuppression;
