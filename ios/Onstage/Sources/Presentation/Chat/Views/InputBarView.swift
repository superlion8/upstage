import SwiftUI

/// Input bar for chat with voice input support
struct InputBarView: View {
  @Binding var text: String
  @Binding var selectedImages: [MessageImage]
  let isLoading: Bool
  let onSend: () -> Void
  let onAddImage: () -> Void
  let onRemoveImage: (Int) -> Void

  @FocusState private var isFocused: Bool
  @StateObject private var audioRecorder = AudioRecorderManager()

  // Voice input state
  @State private var isVoiceMode = false
  @State private var dragOffset: CGFloat = 0
  @State private var showCancelHint = false

  private let cancelThreshold: CGFloat = -80

  var body: some View {
    VStack(spacing: 0) {
      // Selected images preview
      if !selectedImages.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(Array(selectedImages.enumerated()), id: \.element.id) { index, image in
              SelectedImagePreview(
                image: image,
                onRemove: {
                  onRemoveImage(index)
                }
              )
            }
          }
          .padding(.horizontal)
          .padding(.vertical, 8)
        }
        .background(Color(.systemGray6))
      }

      // Voice recording overlay
      if audioRecorder.isRecording {
        VoiceRecordingView(
          audioLevel: audioRecorder.audioLevel,
          transcribedText: audioRecorder.transcribedText,
          showCancelHint: showCancelHint
        )
        .transition(.move(edge: .bottom).combined(with: .opacity))
      }

      // Input area
      HStack(alignment: .bottom, spacing: 12) {
        // Add image button
        Button {
          onAddImage()
        } label: {
          Image(systemName: "photo.badge.plus")
            .font(.title2)
            .foregroundColor(.accentColor)
        }
        .disabled(isLoading || selectedImages.count >= 5 || audioRecorder.isRecording)

        // Text input area (ZStack for stability)
        ZStack {
          // Normal Text Field
          TextField("发消息或按住说话...", text: $text, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(1...5)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .focused($isFocused)
            .opacity(audioRecorder.isRecording ? 0 : 1)
            .allowsHitTesting(!audioRecorder.isRecording)
            .overlay(
              Group {
                // Voice Recording Trigger Layer (Only active when text is empty OR recording is in progress)
                if (text.isEmpty || audioRecorder.isRecording) && !isLoading {
                  Color.clear
                    .contentShape(RoundedRectangle(cornerRadius: 20))
                    .highPriorityGesture(
                      DragGesture(minimumDistance: 0)
                        .onChanged { value in
                          if !isLoading && !audioRecorder.isRecording {
                            startVoiceRecording()
                          }
                          if audioRecorder.isRecording {
                            handleDragChanged(value)
                          }
                        }
                        .onEnded { _ in
                          if audioRecorder.isRecording {
                            stopVoiceRecording()
                          }
                        }
                    )
                }
              }
            )

          // Recording Indicator (Overlaid for stability)
          if audioRecorder.isRecording {
            RoundedRectangle(cornerRadius: 20)
              .fill(showCancelHint ? Color.red : Color.accentColor)
              .frame(height: 40)
              .overlay(
                HStack {
                  Image(systemName: "waveform")
                    .foregroundColor(.white)
                  Text(showCancelHint ? "松开取消" : "正在录音...上移取消")
                    .font(.subheadline)
                    .foregroundColor(.white)
                }
              )
              .allowsHitTesting(false)
          }
        }

        // Voice / Send button
        ZStack {
          if canSend {
            Button {
              onSend()
              isFocused = false
            } label: {
              Image(systemName: "arrow.up.circle.fill")
                .font(.title)
                .foregroundColor(.accentColor)
            }
            .transition(.scale)
          } else {
            Image(systemName: "mic.circle.fill")
              .font(.title)
              .foregroundColor(!isLoading ? .accentColor : .gray)
              .padding(4)
              .contentShape(Rectangle())
              .highPriorityGesture(
                DragGesture(minimumDistance: 0)
                  .onChanged { value in
                    if !isLoading && !audioRecorder.isRecording {
                      startVoiceRecording()
                    }
                    if audioRecorder.isRecording {
                      handleDragChanged(value)
                    }
                  }
                  .onEnded { _ in
                    if audioRecorder.isRecording {
                      stopVoiceRecording()
                    }
                  }
              )
              .transition(.scale)
          }
        }
        .frame(width: 44, height: 44)
        .disabled(isLoading)
      }
      .padding(.horizontal)
      .padding(.vertical, 12)
    }
    .background(Color(.systemBackground))
    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: audioRecorder.isRecording)
  }

  private var canSend: Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !selectedImages.isEmpty
  }

  // MARK: - Voice Recording

  private func handleDragChanged(_ value: DragGesture.Value) {
    if audioRecorder.isRecording {
      dragOffset = value.translation.height
      showCancelHint = dragOffset < cancelThreshold
    }
  }

  private func startVoiceRecording() {
    isFocused = false
    dragOffset = 0
    showCancelHint = false

    Task {
      await audioRecorder.startRecording()
    }
  }

  private func stopVoiceRecording() {
    let shouldCancel = showCancelHint || dragOffset < cancelThreshold

    if shouldCancel {
      audioRecorder.cancelRecording()
    } else {
      let transcribedText = audioRecorder.stopRecording()
      if !transcribedText.isEmpty {
        text = transcribedText
        // Auto focus after recording so user can edit immediately
        isFocused = true
      }
    }

    dragOffset = 0
    showCancelHint = false
  }
}

// MARK: - Voice Recording View

struct VoiceRecordingView: View {
  let audioLevel: Float
  let transcribedText: String
  let showCancelHint: Bool

  var body: some View {
    VStack(spacing: 12) {
      // Cancel hint
      Text(showCancelHint ? "松开取消" : "松手发送，上移取消")
        .font(.subheadline)
        .foregroundColor(showCancelHint ? .red : .secondary)

      // Audio waveform visualization
      HStack(spacing: 2) {
        ForEach(0..<30, id: \.self) { i in
          RoundedRectangle(cornerRadius: 2)
            .fill(showCancelHint ? Color.red : Color.accentColor)
            .frame(width: 4, height: barHeight(for: i))
            .animation(.easeInOut(duration: 0.1), value: audioLevel)
        }
      }
      .frame(height: 40)
      .padding(.horizontal)
      .padding(.vertical, 16)
      .background(showCancelHint ? Color.red.opacity(0.1) : Color.accentColor.opacity(0.1))
      .clipShape(RoundedRectangle(cornerRadius: 12))

      // Transcribed text preview
      if !transcribedText.isEmpty {
        Text(transcribedText)
          .font(.body)
          .foregroundColor(.primary)
          .lineLimit(2)
          .padding(.horizontal)
      }
    }
    .padding()
    .background(Color(.systemBackground))
  }

  private func barHeight(for index: Int) -> CGFloat {
    let baseHeight: CGFloat = 8
    let maxHeight: CGFloat = 32
    let variation = sin(Double(index) * 0.5 + Double(audioLevel) * 10) * 0.5 + 0.5
    return baseHeight + CGFloat(variation) * CGFloat(audioLevel) * (maxHeight - baseHeight)
  }
}

// MARK: - Selected Image Preview

struct SelectedImagePreview: View {
  let image: MessageImage
  let onRemove: () -> Void

  var body: some View {
    ZStack(alignment: .topTrailing) {
      if let uiImage = UIImage(data: image.data) {
        Image(uiImage: uiImage)
          .resizable()
          .aspectRatio(contentMode: .fill)
          .frame(width: 60, height: 60)
          .clipShape(RoundedRectangle(cornerRadius: 8))
      }

      // Label
      Text(image.label)
        .font(.caption2)
        .fontWeight(.medium)
        .foregroundColor(.white)
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
        .background(Color.black.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .offset(x: -4, y: 4)

      // Remove button
      Button {
        onRemove()
      } label: {
        Image(systemName: "xmark.circle.fill")
          .font(.title3)
          .foregroundColor(.white)
          .background(Circle().fill(Color.black.opacity(0.5)))
      }
      .offset(x: 6, y: -6)
    }
  }
}

#Preview {
  VStack {
    Spacer()
    InputBarView(
      text: .constant(""),
      selectedImages: .constant([]),
      isLoading: false,
      onSend: {},
      onAddImage: {},
      onRemoveImage: { _ in }
    )
  }
}
