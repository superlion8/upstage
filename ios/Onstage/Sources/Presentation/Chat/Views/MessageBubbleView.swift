import MarkdownUI
import SwiftUI

/// Message bubble view
struct MessageBubbleView: View {
  @Binding var message: Message

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
          .fill(Theme.Colors.accent.opacity(0.1))
          .frame(width: 32, height: 32)
          .overlay {
            Image(systemName: "sparkles")
              .font(.system(size: 14))
              .foregroundColor(Theme.Colors.accent)
          }
      }

      VStack(alignment: isUser ? .trailing : .leading, spacing: 12) {

        // 1. User Uploaded Images
        if let images = message.content.images, !images.isEmpty {
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 80))], spacing: 8) {
            ForEach(images) { image in
              if let uiImage = UIImage(data: image.data) {
                Image(uiImage: uiImage)
                  .resizable()
                  .aspectRatio(contentMode: .fill)
                  .frame(width: 80, height: 80)
                  .clipShape(RoundedRectangle(cornerRadius: Theme.Layout.radiusCard))
              }
            }
          }
        }

        // 2. Timeline Steps (AI only)
        if !isUser, message.content.agentSteps != nil, !message.content.agentSteps!.isEmpty {
          AgentTimelineView(
            steps: Binding(
              get: { message.content.agentSteps ?? [] },
              set: { message.content.agentSteps = $0 }
            ))
        }

        // 3. Text Content
        if let text = message.content.text, !text.isEmpty {
          if isUser {
            // User Bubble
            Text(text)
              .font(Theme.Typography.body)
              .padding(.horizontal, 16)
              .padding(.vertical, 12)
              .background(Theme.Colors.accent)  // Primary bubble
              .foregroundColor(.white)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          } else {
            // AI Glass Card
            GlassCard(padding: 0) {
              Markdown(text)
                .markdownTheme(Theme.messageTheme(isUser: false))
                .padding(16)
            }
          }
        }

        // 4. GUI Request
        if let guiRequest = message.content.guiRequest {
          GuiRequestView(request: guiRequest)
        }

        // 5. Result Strip (AI Generated Images)
        if let generatedImages = message.content.generatedImages, !generatedImages.isEmpty {
          ResultStrip(images: generatedImages)
        }

        // 6. Status/Error (Simple text below bubble)
        if message.status == .failed {
          Text("Failed to send")
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.error)
        }
      }

      if !isUser {
        Spacer(minLength: 40)
      } else {
        // User Avatar
        Circle()
          .fill(Theme.Colors.surface2)
          .frame(width: 32, height: 32)
          .overlay {
            Image(systemName: "person.fill")
              .font(.system(size: 14))
              .foregroundColor(Theme.Colors.textTertiary)
          }
      }
    }
  }
}

// MARK: - Result Strip Components

struct ResultStrip: View {
  let images: [GeneratedImage]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 12) {
        ForEach(images) { image in
          ResultStripItem(image: image)
        }
      }
      .padding(.horizontal, 4)  // Slight internal padding
    }
  }
}

struct ResultStripItem: View {
  let image: GeneratedImage
  @State private var showFullScreen = false

  var body: some View {
    AsyncImage(url: URL(string: image.thumbnailUrl ?? image.fullURL)) { phase in
      switch phase {
      case .empty:
        GlassCard(padding: 0) {
          ProgressView()
            .frame(width: 160, height: 160)  // 1:1 Square
        }
      case .success(let img):
        img
          .resizable()
          .aspectRatio(contentMode: .fill)
          .frame(width: 160, height: 160)
          .clipShape(RoundedRectangle(cornerRadius: Theme.Layout.radiusCard))
          .overlay(
            RoundedRectangle(cornerRadius: Theme.Layout.radiusCard)
              .stroke(Theme.Colors.border, lineWidth: 1)
          )
          .overlay(alignment: .topTrailing) {
            HStack(spacing: 4) {
              CircleButton(icon: "arrow.down.to.line") {
                // Save action placeholder
              }
              CircleButton(icon: "star") {
                // Asset action placeholder
              }
            }
            .padding(8)
          }
          .onTapGesture {
            showFullScreen = true
          }
      case .failure:
        GlassCard(padding: 0) {
          VStack {
            Image(systemName: "exclamationmark.triangle")
              .foregroundColor(Theme.Colors.error)
            Text("Failed")
              .font(Theme.Typography.caption)
          }
          .frame(width: 160, height: 160)
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

struct CircleButton: View {
  let icon: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.system(size: 12, weight: .bold))
        .foregroundColor(.white)
        .frame(width: 28, height: 28)
        .background(.ultraThinMaterial)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.2), lineWidth: 0.5))
    }
  }
}

// MARK: - Helpers

/// GUI Request view
struct GuiRequestView: View {
  let request: GuiRequest

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      if let message = request.message {
        Text(message)
          .font(Theme.Typography.body)
          .foregroundColor(Theme.Colors.textPrimary)
      }

      switch request.type {
      case .changeOutfit:
        Text("请上传新的服装图片")
          .font(Theme.Typography.caption)
          .foregroundColor(Theme.Colors.textSecondary)
      case .changeModel:
        Text("请上传模特参考图或选择模特风格")
          .font(Theme.Typography.caption)
          .foregroundColor(Theme.Colors.textSecondary)
      case .replicateReference:
        Text("请上传参考图片")
          .font(Theme.Typography.caption)
          .foregroundColor(Theme.Colors.textSecondary)
      case .selectModel, .selectScene:
        Text("请从素材库中选择")
          .font(Theme.Typography.caption)
          .foregroundColor(Theme.Colors.textSecondary)
      }
    }
    .padding(12)
    .background(Theme.Colors.surface2)
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(
      RoundedRectangle(cornerRadius: 12)
        .stroke(Theme.Colors.border, lineWidth: 1)
    )
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
          image.resizable().aspectRatio(contentMode: .fit)
        case .failure:
          Image(systemName: "photo").foregroundColor(.gray)
        @unknown default: EmptyView()
        }
      }
      .ignoresSafeArea()
      .background(Color.black)
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
      }
      .toolbarBackground(.hidden, for: .navigationBar)
    }
  }
}

// MARK: - Markdown Extension

extension Theme {
  static func messageTheme(isUser: Bool) -> MarkdownUI.Theme {
    MarkdownUI.Theme()
      .text {
        ForegroundColor(isUser ? .white : Theme.Colors.textPrimary)
        FontSize(16)
      }
      .link {
        ForegroundColor(isUser ? .white.opacity(0.8) : Theme.Colors.accent)
        UnderlineStyle(.single)
      }
      .strong {
        FontWeight(.bold)
      }
      .emphasis {
        FontStyle(.italic)
      }
      .heading1 { configuration in
        configuration.label
          .markdownTextStyle {
            FontSize(24)
            FontWeight(.bold)
          }
          .padding(.vertical, 8)
      }
      .heading2 { configuration in
        configuration.label
          .markdownTextStyle {
            FontSize(20)
            FontWeight(.bold)
          }
          .padding(.vertical, 6)
      }
      .heading3 { configuration in
        configuration.label
          .markdownTextStyle {
            FontSize(18)
            FontWeight(.bold)
          }
          .padding(.vertical, 4)
      }
      .code {
        FontFamilyVariant(.monospaced)
        FontSize(14)
        BackgroundColor(isUser ? .white.opacity(0.2) : Theme.Colors.surface2)
      }
      .codeBlock { configuration in
        configuration.label
          .relativeLineSpacing(.em(0.25))
          .markdownTextStyle {
            FontFamilyVariant(.monospaced)
            FontSize(13)
          }
          .padding(12)
          .background(isUser ? Color.white.opacity(0.1) : Theme.Colors.bg1)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .markdownMargin(top: .em(0.8), bottom: .em(0.8))
      }
      .listItem { configuration in
        configuration.label
          .markdownMargin(top: .em(0.2))
      }
  }
}
