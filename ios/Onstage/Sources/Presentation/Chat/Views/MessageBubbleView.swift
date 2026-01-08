import MarkdownUI
import SwiftUI

/// Message bubble view
struct MessageBubbleView: View {
  let message: Message

  private var isUser: Bool {
    message.role == .user
  }

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      if isUser {
        Spacer(minLength: 60)
      } else {
        // AI Avatar
        Circle()
          .fill(Color.accentColor.opacity(0.2))
          .frame(width: 36, height: 36)
          .overlay {
            Image(systemName: "sparkles")
              .foregroundColor(.accentColor)
          }
      }

      VStack(alignment: isUser ? .trailing : .leading, spacing: 8) {
        // User uploaded images
        if let images = message.content.images, !images.isEmpty {
          HStack(spacing: 8) {
            ForEach(images) { image in
              if let uiImage = UIImage(data: image.data) {
                Image(uiImage: uiImage)
                  .resizable()
                  .aspectRatio(contentMode: .fill)
                  .frame(width: 80, height: 80)
                  .clipShape(RoundedRectangle(cornerRadius: 8))
                  .overlay(alignment: .topLeading) {
                    Text(image.label)
                      .font(.caption2)
                      .padding(4)
                      .background(.ultraThinMaterial)
                      .clipShape(RoundedRectangle(cornerRadius: 4))
                  }
              }
            }
          }
        }

        // Agent Steps (Cursor-like展示)
        if !isUser, let steps = message.content.agentSteps, !steps.isEmpty {
          AgentStepsView(steps: steps, thinking: message.content.thinking)
            .padding(.bottom, 4)
        }

        // Text content (Markdown supported)
        if let text = message.content.text, !text.isEmpty {
          MarkdownContentView(text: text, isUser: isUser)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(isUser ? Color.accentColor : Color(.systemGray6))
            .foregroundColor(isUser ? .white : .primary)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        }

        // Generated images
        if let generatedImages = message.content.generatedImages, !generatedImages.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(generatedImages) { image in
              GeneratedImageView(image: image)
            }
          }
        }

        // GUI Request
        if let guiRequest = message.content.guiRequest {
          GuiRequestView(request: guiRequest)
        }

        // Status indicator
        if message.status == .generating {
          HStack(spacing: 4) {
            ProgressView()
              .scaleEffect(0.8)
            Text("生成中...")
              .font(.caption)
              .foregroundColor(.secondary)
          }
        } else if message.status == .failed {
          HStack(spacing: 4) {
            Image(systemName: "exclamationmark.circle")
              .foregroundColor(.red)
            Text("发送失败")
              .font(.caption)
              .foregroundColor(.red)
          }
        }
      }

      if !isUser {
        Spacer(minLength: 60)
      } else {
        // User Avatar
        Circle()
          .fill(Color(.systemGray4))
          .frame(width: 36, height: 36)
          .overlay {
            Image(systemName: "person.fill")
              .foregroundColor(.gray)
          }
      }
    }
  }
}

/// Generated image view with actions
struct GeneratedImageView: View {
  let image: GeneratedImage
  @State private var showFullScreen = false

  var body: some View {
    AsyncImage(url: URL(string: image.fullURL)) { phase in
      switch phase {
      case .empty:
        Color.gray.opacity(0.3)
          .frame(width: 250, height: 250)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .overlay {
            ProgressView()
          }
      case .success(let loadedImage):
        loadedImage
          .resizable()
          .aspectRatio(contentMode: .fit)
          .frame(maxWidth: 250)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .onTapGesture {
            showFullScreen = true
          }
      case .failure:
        Color.gray.opacity(0.3)
          .frame(width: 250, height: 250)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .overlay {
            Image(systemName: "photo")
              .foregroundColor(.gray)
          }
      @unknown default:
        EmptyView()
      }
    }
    .fullScreenCover(isPresented: $showFullScreen) {
      FullScreenImageView(url: image.fullURL)
    }
  }
}

/// Full screen image view
struct FullScreenImageView: View {
  let url: String
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      AsyncImage(url: URL(string: url)) { phase in
        switch phase {
        case .empty:
          ProgressView()
        case .success(let image):
          image
            .resizable()
            .aspectRatio(contentMode: .fit)
        case .failure:
          Image(systemName: "photo")
            .foregroundColor(.gray)
        @unknown default:
          EmptyView()
        }
      }
      .ignoresSafeArea()
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark.circle.fill")
              .font(.title2)
              .foregroundColor(.white)
          }
        }

        ToolbarItem(placement: .bottomBar) {
          HStack {
            Button {
              // Save to photos
            } label: {
              Label("保存", systemImage: "square.and.arrow.down")
            }

            Spacer()

            Button {
              // Share
            } label: {
              Label("分享", systemImage: "square.and.arrow.up")
            }
          }
        }
      }
      .toolbarBackground(.hidden, for: .navigationBar)
    }
    .background(Color.black)
  }
}

/// GUI Request view
struct GuiRequestView: View {
  let request: GuiRequest

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      if let message = request.message {
        Text(message)
          .font(.subheadline)
      }

      // Action buttons based on type
      switch request.type {
      case .changeOutfit:
        Text("请上传新的服装图片")
          .font(.caption)
          .foregroundColor(.secondary)
      case .changeModel:
        Text("请上传模特参考图或选择模特风格")
          .font(.caption)
          .foregroundColor(.secondary)
      case .replicateReference:
        Text("请上传参考图片")
          .font(.caption)
          .foregroundColor(.secondary)
      case .selectModel, .selectScene:
        Text("请从素材库中选择")
          .font(.caption)
          .foregroundColor(.secondary)
      }
    }
    .padding()
    .background(Color.accentColor.opacity(0.1))
    .clipShape(RoundedRectangle(cornerRadius: 12))
  }
}

#Preview {
  VStack {
    MessageBubbleView(
      message: Message(
        id: UUID(),
        role: .user,
        content: MessageContent(text: "帮我生成一张模特图"),
        createdAt: Date(),
        status: .sent
      ))

    MessageBubbleView(
      message: Message(
        id: UUID(),
        role: .assistant,
        content: MessageContent(text: "好的，我来帮你生成模特图。请稍等..."),
        createdAt: Date(),
        status: .sent
      ))
  }
  .padding()
}
