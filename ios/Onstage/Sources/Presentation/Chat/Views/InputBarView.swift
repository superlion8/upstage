import SwiftUI

struct ChatInputBar: View {
  @Binding var text: String
  @Binding var selectedImages: [MessageImage]  // Changed from [Data]
  let isLoading: Bool
  let onSend: () -> Void
  let onQuickAction: (String) -> Void
  let onUpload: () -> Void
  let onRemoveImage: (Int) -> Void

  private let quickActions = [
    "Change Model", "Change Outfit", "Replicate", "Edit",
  ]

  var body: some View {
    VStack(spacing: 12) {
      // Quick Actions
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

        // Send Button (only if text not empty or has images)
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
    )
  }
}
