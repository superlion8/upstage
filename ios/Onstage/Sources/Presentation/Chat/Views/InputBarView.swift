import SwiftUI

struct ChatInputBar: View {
  @Binding var text: String
  @Binding var selectedImages: [MessageImage]
  @ObservedObject var audioRecorder: AudioRecorderManager
  let isLoading: Bool
  let onSend: () -> Void
  let onQuickAction: (String) -> Void
  let onUpload: () -> Void
  let onRemoveImage: (Int) -> Void

  @State private var isDragCancelled = false
  @State private var dragOffset: CGFloat = 0

  private let quickActions = [
    "Change Model", "Change Outfit", "Replicate", "Edit",
  ]

  var body: some View {
    VStack(spacing: 12) {
      // Audio Visualization Overlay
      if audioRecorder.isRecording {
        HStack(spacing: 4) {
          Image(systemName: isDragCancelled ? "trash.fill" : "mic.fill")
            .foregroundColor(isDragCancelled ? .red : .accentColor)
          Text(isDragCancelled ? "Release to Cancel" : "Listening...")
            .font(.caption)
            .foregroundColor(Theme.Colors.textPrimary)

          if !isDragCancelled {
            Spacer()
            Text("Slide up to cancel")
              .font(.caption2)
              .foregroundColor(Theme.Colors.textTertiary)
          }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 8)
        .background(Theme.Colors.surface2)
        .cornerRadius(12)
        .transition(.move(edge: .bottom).combined(with: .opacity))
      }

      // Quick Actions
      if !audioRecorder.isRecording {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(quickActions, id: \.self) { action in
              Chip(title: action, isSelected: false) {
                onQuickAction(action)
              }
            }
          }
          .padding(.horizontal, Theme.Layout.sidePadding)
        }
        .frame(height: 32)
      }

      // Selected Images Preview
      if !selectedImages.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(Array(selectedImages.enumerated()), id: \.element.id) { index, image in
              if let uiImage = UIImage(data: image.data) {
                Image(uiImage: uiImage)
                  .resizable()
                  .aspectRatio(contentMode: .fill)
                  .frame(width: 60, height: 60)
                  .clipShape(RoundedRectangle(cornerRadius: 8))
                  .overlay(alignment: .topTrailing) {
                    Button {
                      onRemoveImage(index)
                    } label: {
                      Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.white)
                        .background(Color.black.opacity(0.5))
                        .clipShape(Circle())
                    }
                    .padding(2)
                  }
              }
            }
          }
          .padding(.horizontal, Theme.Layout.sidePadding)
        }
      }

      // Input Area
      HStack(spacing: 12) {
        // Upload Button
        Button(action: onUpload) {
          Image(systemName: "plus")
            .font(.system(size: 20, weight: .medium))
            .foregroundColor(Theme.Colors.textSecondary)
            .frame(width: 40, height: 40)
            .background(Theme.Colors.surface2)
            .clipShape(Circle())
        }

        // Text Input
        AppInput(
          text: $text,
          placeholder: "Type a message...",
          icon: nil,
          onCommit: onSend
        )

        // Right Button: Send or Mic
        if !text.isEmpty || !selectedImages.isEmpty {
          Button(action: onSend) {
            if isLoading {
              ProgressView()
                .tint(.white)
            } else {
              Image(systemName: "arrow.up")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
            }
          }
          .frame(width: 40, height: 40)
          .background(Theme.Colors.accent)
          .clipShape(Circle())
          .transition(.scale)
          .disabled(isLoading)
        } else {
          // Voice Button
          ZStack {
            Circle()
              .fill(
                audioRecorder.isRecording
                  ? (isDragCancelled ? Theme.Colors.error : Theme.Colors.accent)
                  : Theme.Colors.surface2
              )
              .frame(width: 40, height: 40)
              .scaleEffect(audioRecorder.isRecording ? 1.2 : 1.0)
              .animation(.spring(response: 0.3), value: audioRecorder.isRecording)

            Image(systemName: "mic.fill")
              .font(.system(size: 18))
              .foregroundColor(audioRecorder.isRecording ? .white : Theme.Colors.textSecondary)
              .scaleEffect(isDragCancelled ? 0.8 : 1)
          }
          .gesture(
            DragGesture(minimumDistance: 0)
              .onChanged { value in
                if !audioRecorder.isRecording {
                  Task { await audioRecorder.startRecording() }
                }

                // Logic to detect slide up cancel
                dragOffset = value.translation.height
                isDragCancelled = dragOffset < -50
              }
              .onEnded { value in
                if isDragCancelled {
                  audioRecorder.cancelRecording()
                } else {
                  let transcribed = audioRecorder.stopRecording()
                  if !transcribed.isEmpty {
                    text += " " + transcribed
                  }
                }
                isDragCancelled = false
                dragOffset = 0
              }
          )
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 8)
    }
    .padding(.top, 12)
    .background(
      // Blur effect for Input Bar background
      Rectangle()
        .fill(Theme.Colors.bg0.opacity(0.8))
        .background(.ultraThinMaterial)
        .ignoresSafeArea()
        .onTapGesture {
          // Swallow taps on the bar so they don't dismiss keyboard
        }
    )
  }
}
