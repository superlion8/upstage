import SwiftUI

// MARK: - Composer Mode

enum ComposerMode: Equatable {
  case idle
  case typing
  case recording
  case cancelReady
}

// MARK: - ChatComposer (Doubao Style)

struct ChatComposer: View {
  // MARK: - Bindings
  @Binding var text: String
  @Binding var selectedImages: [MessageImage]

  // MARK: - Callbacks
  let onSend: () -> Void
  let onOpenCamera: () -> Void
  let onOpenPhotoLibrary: () -> Void

  // MARK: - Audio & State
  @ObservedObject var audioRecorder: AudioRecorderManager
  @FocusState private var isTextFieldFocused: Bool
  @State private var mode: ComposerMode = .idle
  @State private var dragOffset: CGFloat = 0
  @State private var recordingStartTime: Date?
  @State private var showHUD: Bool = false

  // MARK: - Constants
  private let cancelThreshold: CGFloat = -60
  private let hudDelay: TimeInterval = 0.1

  var body: some View {
    VStack(spacing: 0) {
      // Recording HUD (floats above)
      if showHUD {
        RecordingHUD(isCancelReady: mode == .cancelReady)
          .transition(.opacity.combined(with: .move(edge: .bottom)))
          .padding(.bottom, 20)
      }

      // Selected Images Preview
      if !selectedImages.isEmpty {
        ImagePreviewStrip(images: selectedImages, onRemove: removeImage)
          .padding(.horizontal, 16)
          .padding(.bottom, 8)
      }

      // Main Input Bar
      HStack(spacing: 12) {
        // Camera Button (Left)
        Button(action: onOpenCamera) {
          Image(systemName: "camera.fill")
            .font(.system(size: 20))
            .foregroundColor(Theme.Colors.textSecondary)
            .frame(width: 44, height: 44)
        }

        // Input Area (Center)
        inputArea

        // Right Side Buttons
        if mode == .typing && !text.isEmpty {
          // Send Button (when typing with text)
          sendButton
        } else {
          // Mic Button
          micButton

          // + Button (Photo Library)
          Button(action: onOpenPhotoLibrary) {
            Image(systemName: "plus")
              .font(.system(size: 20, weight: .medium))
              .foregroundColor(Theme.Colors.textSecondary)
              .frame(width: 44, height: 44)
          }
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(composerBackground)
    }
    .animation(.spring(response: 0.3), value: mode)
    .animation(.spring(response: 0.3), value: showHUD)
    .onChange(of: isTextFieldFocused) { focused in
      mode = focused ? .typing : .idle
    }
  }

  // MARK: - Input Area

  @ViewBuilder
  private var inputArea: some View {
    ZStack(alignment: .leading) {
      if mode == .recording || mode == .cancelReady {
        // Recording state
        HStack(spacing: 8) {
          Circle()
            .fill(Color.red)
            .frame(width: 8, height: 8)
          Text("正在录音...")
            .font(Theme.Typography.body)
            .foregroundColor(Theme.Colors.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .frame(height: 44)
      } else if mode == .typing || !text.isEmpty {
        // Text input mode
        TextField("发消息...", text: $text, axis: .vertical)
          .font(Theme.Typography.body)
          .foregroundColor(Theme.Colors.textPrimary)
          .lineLimit(1...4)
          .padding(.horizontal, 16)
          .padding(.vertical, 10)
          .focused($isTextFieldFocused)
          .onSubmit {
            if !text.isEmpty {
              onSend()
            }
          }
      } else {
        // Idle placeholder
        Text("发消息或按住说话...")
          .font(Theme.Typography.body)
          .foregroundColor(Theme.Colors.textTertiary)
          .padding(.horizontal, 16)
          .frame(height: 44, alignment: .leading)
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
          .onTapGesture {
            isTextFieldFocused = true
          }
      }
    }
    .background(Theme.Colors.surface1)
    .clipShape(RoundedRectangle(cornerRadius: 22))
  }

  // MARK: - Mic Button with Gesture

  private var micButton: some View {
    ZStack {
      Circle()
        .fill(micButtonColor)
        .frame(width: 44, height: 44)

      Image(systemName: "mic.fill")
        .font(.system(size: 18))
        .foregroundColor(
          mode == .recording || mode == .cancelReady ? .white : Theme.Colors.textSecondary)
    }
    .scaleEffect(mode == .recording || mode == .cancelReady ? 1.2 : 1.0)
    .gesture(
      DragGesture(minimumDistance: 0)
        .onChanged { value in
          handleDragChanged(value)
        }
        .onEnded { _ in
          handleDragEnded()
        }
    )
  }

  private var micButtonColor: Color {
    switch mode {
    case .recording:
      return Theme.Colors.accent
    case .cancelReady:
      return Theme.Colors.error
    default:
      return Theme.Colors.surface2
    }
  }

  // MARK: - Send Button

  private var sendButton: some View {
    Button {
      onSend()
      isTextFieldFocused = false
    } label: {
      Image(systemName: "arrow.up")
        .font(.system(size: 16, weight: .bold))
        .foregroundColor(.white)
        .frame(width: 44, height: 44)
        .background(Theme.Colors.accent)
        .clipShape(Circle())
    }
    .transition(.scale)
  }

  // MARK: - Composer Background

  private var composerBackground: some View {
    Rectangle()
      .fill(Theme.Colors.bg0.opacity(0.95))
      .background(.ultraThinMaterial)
      .ignoresSafeArea()
  }

  // MARK: - Gesture Handlers

  private func handleDragChanged(_ value: DragGesture.Value) {
    // Start recording on first touch
    if mode != .recording && mode != .cancelReady {
      startRecording()
    }

    // Check for cancel gesture (slide up)
    dragOffset = value.translation.height
    let newMode: ComposerMode = dragOffset < cancelThreshold ? .cancelReady : .recording

    // Haptic on mode change
    if newMode != mode && (newMode == .cancelReady || mode == .cancelReady) {
      UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    mode = newMode
  }

  private func handleDragEnded() {
    if mode == .cancelReady {
      // Cancel recording
      audioRecorder.cancelRecording()
    } else if mode == .recording {
      // Send voice
      let transcribed = audioRecorder.stopRecording()
      if !transcribed.isEmpty {
        text = transcribed
        // Auto-send voice transcription
        onSend()
      }
    }

    // Reset state
    mode = .idle
    dragOffset = 0
    showHUD = false
    recordingStartTime = nil
  }

  private func startRecording() {
    recordingStartTime = Date()
    UIImpactFeedbackGenerator(style: .light).impactOccurred()

    Task {
      await audioRecorder.startRecording()
    }

    mode = .recording

    // Show HUD after delay
    DispatchQueue.main.asyncAfter(deadline: .now() + hudDelay) {
      if mode == .recording || mode == .cancelReady {
        showHUD = true
      }
    }
  }

  private func removeImage(at index: Int) {
    guard index < selectedImages.count else { return }
    selectedImages.remove(at: index)
  }
}

// MARK: - Recording HUD

struct RecordingHUD: View {
  let isCancelReady: Bool

  var body: some View {
    VStack(spacing: 12) {
      // Waveform placeholder
      HStack(spacing: 4) {
        ForEach(0..<5, id: \.self) { i in
          RoundedRectangle(cornerRadius: 2)
            .fill(isCancelReady ? Color.white : Theme.Colors.accent)
            .frame(width: 4, height: CGFloat.random(in: 12...32))
        }
      }
      .frame(height: 40)

      // Text
      Text(isCancelReady ? "松手取消" : "松手发送，上移取消")
        .font(Theme.Typography.caption)
        .foregroundColor(isCancelReady ? .white : Theme.Colors.textPrimary)
    }
    .padding(.horizontal, 32)
    .padding(.vertical, 20)
    .background(
      RoundedRectangle(cornerRadius: 20)
        .fill(isCancelReady ? Theme.Colors.error : Theme.Colors.surface1)
        .shadow(color: .black.opacity(0.2), radius: 20, y: 10)
    )
  }
}

// MARK: - Image Preview Strip

struct ImagePreviewStrip: View {
  let images: [MessageImage]
  let onRemove: (Int) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(Array(images.enumerated()), id: \.element.id) { index, image in
          if let uiImage = UIImage(data: image.data) {
            ZStack(alignment: .topTrailing) {
              Image(uiImage: uiImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8))

              Button {
                onRemove(index)
              } label: {
                Image(systemName: "xmark.circle.fill")
                  .foregroundColor(.white)
                  .background(Color.black.opacity(0.5).clipShape(Circle()))
              }
              .padding(2)
            }
          }
        }
      }
    }
  }
}
