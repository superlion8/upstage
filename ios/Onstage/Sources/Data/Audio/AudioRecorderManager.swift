import AVFoundation
import Foundation
import Speech

/// Manages audio recording and speech-to-text for voice input
@MainActor
class AudioRecorderManager: NSObject, ObservableObject {

  // MARK: - Published Properties
  @Published var isRecording = false
  @Published var transcribedText = ""
  @Published var audioLevel: Float = 0.0
  @Published var recordingCancelled = false
  @Published var hasPermission = false

  // MARK: - Private Properties
  private var audioRecorder: AVAudioRecorder?
  private var audioSession: AVAudioSession?
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var audioEngine: AVAudioEngine?
  private var levelTimer: Timer?

  // MARK: - Initialization
  override init() {
    super.init()
    speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    audioEngine = AVAudioEngine()
  }

  // MARK: - Permission Handling
  func requestPermissions() async -> Bool {
    // Request microphone permission
    let audioStatus = await withCheckedContinuation { continuation in
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        continuation.resume(returning: granted)
      }
    }

    guard audioStatus else {
      hasPermission = false
      return false
    }

    // Request speech recognition permission
    let speechStatus = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status == .authorized)
      }
    }

    hasPermission = speechStatus
    return speechStatus
  }

  // MARK: - Recording Control
  func startRecording() async {
    guard await requestPermissions() else {
      print("❌ Audio permissions not granted")
      return
    }

    recordingCancelled = false
    transcribedText = ""

    do {
      // Configure audio session
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.record, mode: .measurement, options: .duckOthers)
      try session.setActive(true, options: .notifyOthersOnDeactivation)

      // Setup speech recognition
      recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
      recognitionRequest?.shouldReportPartialResults = true

      let inputNode = audioEngine!.inputNode
      let recordingFormat = inputNode.outputFormat(forBus: 0)

      inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) {
        [weak self] buffer, _ in
        self?.recognitionRequest?.append(buffer)

        // Calculate audio level for visualization
        let level = self?.calculateAudioLevel(buffer: buffer) ?? 0
        Task { @MainActor in
          self?.audioLevel = level
        }
      }

      audioEngine?.prepare()
      try audioEngine?.start()

      // Start recognition
      recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest!) {
        [weak self] result, error in
        Task { @MainActor in
          if let result = result {
            self?.transcribedText = result.bestTranscription.formattedString
          }

          if error != nil || result?.isFinal == true {
            self?.audioEngine?.stop()
            inputNode.removeTap(onBus: 0)
          }
        }
      }

      isRecording = true

    } catch {
      print("❌ Failed to start recording: \(error)")
    }
  }

  func stopRecording() -> String {
    isRecording = false
    audioLevel = 0

    audioEngine?.stop()
    audioEngine?.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()

    try? AVAudioSession.sharedInstance().setActive(false)

    return recordingCancelled ? "" : transcribedText
  }

  func cancelRecording() {
    recordingCancelled = true
    _ = stopRecording()
  }

  // MARK: - Audio Level Calculation
  private func calculateAudioLevel(buffer: AVAudioPCMBuffer) -> Float {
    guard let channelData = buffer.floatChannelData else { return 0 }

    let frames = buffer.frameLength
    var sum: Float = 0

    for i in 0..<Int(frames) {
      let sample = channelData[0][i]
      sum += sample * sample
    }

    let rms = sqrt(sum / Float(frames))
    let db = 20 * log10(rms)

    // Normalize to 0-1 range
    let minDb: Float = -60
    let maxDb: Float = 0
    let normalized = (db - minDb) / (maxDb - minDb)

    return max(0, min(1, normalized))
  }
}
