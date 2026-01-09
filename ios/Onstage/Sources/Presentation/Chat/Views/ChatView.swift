import SwiftUI

/// Main chat view
struct ChatView: View {
  @StateObject private var viewModel = ChatViewModel()
  @State private var showConversationList = false

  var body: some View {
    NavigationStack {
      ZStack(alignment: .bottom) {
        // Global Background
        Theme.Colors.bg0.ignoresSafeArea()

        VStack(spacing: 0) {
          // Custom Header
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text("UpStage")
                .font(Theme.Typography.title)
                .foregroundColor(Theme.Colors.textPrimary)

              // Brand Pill
              HStack(spacing: 4) {
                Circle()
                  .fill(Theme.Colors.success)
                  .frame(width: 6, height: 6)
                Text("Onstage Studio")
                  .font(Theme.Typography.caption)
                  .foregroundColor(Theme.Colors.textSecondary)
              }
            }

            Spacer()

            // New Chat Button
            GhostButton("New") {
              viewModel.startNewConversation()
            }

            // History Button
            Button {
              showConversationList = true
            } label: {
              Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 20))
                .foregroundColor(Theme.Colors.textSecondary)
            }
            .padding(.leading, 8)
          }
          .padding(.horizontal, Theme.Layout.sidePadding)
          .padding(.bottom, 8)
          .background(Theme.Colors.bg0.opacity(0.95))

          // Blocks Area
          ScrollViewReader { proxy in
            ScrollView {
              LazyVStack(spacing: 16) {
                ForEach($viewModel.blocks) { $block in
                  BlockRenderer(block: $block)
                    .id(block.id)
                }

                // Spacer for input bar
                Spacer().frame(height: 100)
              }
              .padding(.horizontal, Theme.Layout.padding)
              .padding(.top, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: viewModel.blocks.count) { _ in
              scrollToBottom(proxy: proxy)
            }
          }
        }

        // Input Bar (Floating at bottom)
        // Input Bar (Floating at bottom)
        ChatInputBar(
          text: $viewModel.inputText,
          selectedImages: $viewModel.selectedImages,
          audioRecorder: viewModel.audioRecorder,
          isLoading: viewModel.isLoading,
          onSend: {
            // Dismiss keyboard first
            UIApplication.shared.sendAction(
              #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            Task {
              await viewModel.sendMessage()
            }
          },
          onQuickAction: { action in
            handleQuickAction(action)
          },
          onUpload: {
            viewModel.showImagePicker = true
          },
          onRemoveImage: { index in
            viewModel.removeImage(at: index)
          }
        )
      }
      .onTapGesture {
        // Dismiss keyboard on tap outside
        UIApplication.shared.sendAction(
          #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
      }
      .navigationBarHidden(true)
      // Sheets
      .sheet(isPresented: $showConversationList) {
        ConversationListView(
          conversations: viewModel.conversations,
          onSelect: { conversation in
            Task {
              await viewModel.selectConversation(conversation)
            }
            showConversationList = false
          },
          onDelete: { conversation in
            Task {
              await viewModel.deleteConversation(conversation)
            }
          }
        )
      }
      .sheet(item: $viewModel.showActionSheet) { actionType in
        ActionSheetView(
          actionType: actionType,
          onSubmit: { original, additional, notes in
            Task {
              await viewModel.submitActionSheet(
                action: actionType,
                originalImage: original,
                additionalImages: additional,
                notes: notes
              )
            }
          }
        )
      }
      .sheet(isPresented: $viewModel.showImagePicker) {
        ImagePicker { data in
          viewModel.addImage(data)
        }
      }
      .alert(
        "Error",
        isPresented: .init(
          get: { viewModel.error != nil },
          set: { if !$0 { viewModel.error = nil } }
        )
      ) {
        Button("OK", role: .cancel) {}
      } message: {
        Text(viewModel.error ?? "")
      }
    }
  }

  private func scrollToBottom(proxy: ScrollViewProxy) {
    if let lastBlock = viewModel.blocks.last {
      withAnimation {
        proxy.scrollTo(lastBlock.id, anchor: .bottom)
      }
    }
  }

  private func handleQuickAction(_ action: String) {
    switch action {
    case "Change Model": viewModel.handleAction(.changeModel)
    case "Change Outfit": viewModel.handleAction(.changeOutfit)
    case "Replicate": viewModel.handleAction(.replicateReference)
    default: break
    }
  }
}

struct ConversationListView: View {
  let conversations: [Conversation]
  let onSelect: (Conversation) -> Void
  let onDelete: (Conversation) -> Void

  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        ForEach(conversations) { conversation in
          Button {
            onSelect(conversation)
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(conversation.title ?? "New Conversation")
                .font(Theme.Typography.body)
                .foregroundColor(Theme.Colors.textPrimary)
              Text(conversation.updatedAt.formatted())
                .font(Theme.Typography.caption)
                .foregroundColor(Theme.Colors.textSecondary)
            }
          }
          .listRowBackground(Theme.Colors.bg1)
        }
        .onDelete { indexSet in
          for index in indexSet {
            onDelete(conversations[index])
          }
        }
      }
      .scrollContentBackground(.hidden)
      .background(Theme.Colors.bg0)
      .navigationTitle("History")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Done") {
            dismiss()
          }
        }
      }
    }
  }
}
