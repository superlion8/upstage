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
    ZStack {
      // Main composer content
      VStack(spacing: 0) {
        // Selected Images Preview
        if !selectedImages.isEmpty {
          ImagePreviewStrip(images: selectedImages, onRemove: removeImage)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }

        // Main Input Bar (Capsule Style like screenshot)
        HStack(spacing: 0) {
          // Camera Button (Left, inside capsule)
          Button {
            onOpenCamera()
          } label: {
            Image(systemName: "camera")
              .font(.system(size: 22))
              .foregroundColor(Theme.Colors.textSecondary)
              .frame(width: 48, height: 48)
          }

          // Input Area (Center, tappable)
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
            } else if mode == .typing {
              // Text input mode
              TextField("发消息...", text: $text, axis: .vertical)
                .font(Theme.Typography.body)
                .foregroundColor(Theme.Colors.textPrimary)
                .lineLimit(1...4)
                .focused($isTextFieldFocused)
                .submitLabel(.send)
                .onSubmit {
                  if !text.isEmpty {
                    onSend()
                  }
                }
            } else {
              // Idle placeholder - tappable
              Text("发消息或按住说话...")
                .font(Theme.Typography.body)
                .foregroundColor(Theme.Colors.textTertiary)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
          .frame(maxWidth: .infinity)
          .frame(minHeight: 44)
          .contentShape(Rectangle())
          .gesture(
            // Tap to type
            TapGesture()
              .onEnded {
                if mode != .recording && mode != .cancelReady {
                  mode = .typing
                  isTextFieldFocused = true
                }
              }
          )
          .simultaneousGesture(
            // Long-press to record (on entire input area)
            // Only enabled when NOT in typing mode to avoid interfering with TextField
            DragGesture(minimumDistance: 0)
              .onChanged { value in
                // Don't trigger recording when TextField is focused (user is editing text)
                guard !isTextFieldFocused else { return }

                // Only start if held for a moment (not just a tap)
                if mode == .idle {
                  // Wait for actual drag or hold
                  if value.time.timeIntervalSince1970 > 0.2 || abs(value.translation.height) > 5 {
                    handleDragChanged(value)
                  }
                } else if mode == .recording || mode == .cancelReady {
                  handleDragChanged(value)
                }
              }
              .onEnded { value in
                if mode == .recording || mode == .cancelReady {
                  handleDragEnded()
                }
              }
          )

          // Right side buttons
          if mode == .typing && !text.isEmpty {
            // Send Button
            Button {
              onSend()
              isTextFieldFocused = false
              mode = .idle
            } label: {
              Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 28))
                .foregroundColor(Theme.Colors.accent)
            }
            .frame(width: 48, height: 48)
          } else {
            // Mic Button (with gesture)
            micButton

            // + Button (Photo Library)
            Button {
              onOpenPhotoLibrary()
            } label: {
              Image(systemName: "plus.circle")
                .font(.system(size: 28))
                .foregroundColor(Theme.Colors.textSecondary)
            }
            .frame(width: 48, height: 48)
          }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
          Capsule()
            .fill(Color(UIColor.systemBackground))
            .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
      }

      // Fullscreen Recording Overlay
      if showHUD {
        RecordingOverlay(isCancelReady: mode == .cancelReady)
          .transition(.opacity)
          .zIndex(100)
      }
    }
    .animation(.spring(response: 0.3), value: mode)
    .animation(.spring(response: 0.3), value: showHUD)
    .onChange(of: isTextFieldFocused) { focused in
      if focused {
        // When focused, always be in typing mode
        mode = .typing
      } else if text.isEmpty {
        // Only go to idle if text is empty
        mode = .idle
      }
      // If not focused but text is not empty, stay in .typing mode
    }
    .onChange(of: text) { newText in
      // When text changes (e.g., after voice input), ensure we're in typing mode if there's text
      if !newText.isEmpty && mode == .idle {
        mode = .typing
      }
    }
  }

  // MARK: - Mic Button with Gesture

  private var micButton: some View {
    ZStack {
      Image(systemName: mode == .recording || mode == .cancelReady ? "mic.fill" : "waveform.circle")
        .font(.system(size: 28))
        .foregroundColor(micButtonColor)
    }
    .frame(width: 48, height: 48)
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
      return Theme.Colors.textSecondary
    }
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
      mode = .idle
    } else if mode == .recording {
      // Fill transcribed text into input (don't auto-send)
      let transcribed = audioRecorder.stopRecording()
      if !transcribed.isEmpty {
        text = transcribed
        // Switch to typing mode so user can review and send
        mode = .typing
        isTextFieldFocused = true
      } else {
        mode = .idle
      }
    }

    // Reset recording state
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
// MARK: - Recording Overlay (Arc Blur Gradient Style)

struct RecordingOverlay: View {
  let isCancelReady: Bool
  @State private var waveformPhase: CGFloat = 0

  var body: some View {
    ZStack(alignment: .bottom) {
      // Arc-shaped gradient background with blur edge
      ArcGradientBackground(isCancelReady: isCancelReady)

      // Content
      VStack(spacing: 20) {
        // Main text
        Text(isCancelReady ? "松手取消" : "松手发送，上移取消")
          .font(.system(size: 17, weight: .medium))
          .foregroundColor(.white)

        // Animated waveform dots
        HStack(spacing: 3) {
          ForEach(0..<50, id: \.self) { i in
            Circle()
              .fill(Color.white.opacity(0.9))
              .frame(width: 4, height: 4)
              .offset(y: waveformOffset(for: i))
          }
        }
        .animation(
          .easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: waveformPhase
        )
        .onAppear {
          waveformPhase = 1
        }
      }
      .padding(.bottom, 40)
    }
    .frame(height: 200)
    .transition(.move(edge: .bottom).combined(with: .opacity))
  }

  private func waveformOffset(for index: Int) -> CGFloat {
    let phase = waveformPhase * .pi * 2
    let offset = sin(phase + Double(index) * 0.25) * 6
    return CGFloat(offset)
  }
}

// MARK: - Arc Gradient Background Shape

struct ArcGradientBackground: View {
  let isCancelReady: Bool

  private var topColor: Color {
    isCancelReady
      ? Color(red: 1.0, green: 0.6, blue: 0.6).opacity(0.0)
      : Color(red: 0.5, green: 0.8, blue: 1.0).opacity(0.0)
  }

  private var middleColor: Color {
    isCancelReady
      ? Color(red: 0.95, green: 0.35, blue: 0.35) : Color(red: 0.3, green: 0.6, blue: 0.95)
  }

  private var bottomColor: Color {
    isCancelReady
      ? Color(red: 0.85, green: 0.2, blue: 0.2) : Color(red: 0.15, green: 0.45, blue: 0.85)
  }

  var body: some View {
    ZStack {
      // Main gradient with elliptical arc top
      EllipticalArc()
        .fill(
          LinearGradient(
            stops: [
              .init(color: topColor, location: 0.0),
              .init(color: middleColor.opacity(0.85), location: 0.3),
              .init(color: bottomColor, location: 1.0),
            ],
            startPoint: .top,
            endPoint: .bottom
          )
        )

      // Soft blur overlay at top edge
      EllipticalArc()
        .fill(
          LinearGradient(
            colors: [
              Color.clear,
              middleColor.opacity(0.3),
            ],
            startPoint: .top,
            endPoint: .center
          )
        )
        .blur(radius: 20)
    }
  }
}

// MARK: - Elliptical Arc Shape

struct EllipticalArc: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()

    // Start from bottom left
    path.move(to: CGPoint(x: 0, y: rect.height))

    // Line to the left side where arc starts (about 60% down)
    path.addLine(to: CGPoint(x: 0, y: rect.height * 0.4))

    // Curved arc at top (elliptical curve)
    path.addQuadCurve(
      to: CGPoint(x: rect.width, y: rect.height * 0.4),
      control: CGPoint(x: rect.width / 2, y: -rect.height * 0.1)
    )

    // Line down right side
    path.addLine(to: CGPoint(x: rect.width, y: rect.height))

    // Close the path
    path.closeSubpath()

    return path
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
