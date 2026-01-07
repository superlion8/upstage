import SwiftUI

/// Main chat view
struct ChatView: View {
    @StateObject private var viewModel = ChatViewModel()
    @State private var showConversationList = false
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(viewModel.messages) { message in
                                MessageBubbleView(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: viewModel.messages.count) { _ in
                        if let lastMessage = viewModel.messages.last {
                            withAnimation {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                }
                
                Divider()
                
                // Action Bar
                ActionBarView(onAction: viewModel.handleAction)
                
                // Input Bar
                InputBarView(
                    text: $viewModel.inputText,
                    selectedImages: $viewModel.selectedImages,
                    isLoading: viewModel.isLoading,
                    onSend: {
                        Task {
                            await viewModel.sendMessage()
                        }
                    },
                    onAddImage: {
                        viewModel.showImagePicker = true
                    },
                    onRemoveImage: viewModel.removeImage
                )
            }
            .navigationTitle(viewModel.currentConversationId == nil ? "新对话" : "对话")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showConversationList = true
                    } label: {
                        Image(systemName: "list.bullet")
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        viewModel.startNewConversation()
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                }
            }
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
            .alert("错误", isPresented: .init(
                get: { viewModel.error != nil },
                set: { if !$0 { viewModel.error = nil } }
            )) {
                Button("确定", role: .cancel) {}
            } message: {
                Text(viewModel.error ?? "")
            }
        }
    }
}

/// Conversation list view
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
                            Text(conversation.title ?? "新对话")
                                .font(.headline)
                                .foregroundColor(.primary)
                            Text(conversation.updatedAt.formatted())
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .onDelete { indexSet in
                    for index in indexSet {
                        onDelete(conversations[index])
                    }
                }
            }
            .navigationTitle("对话历史")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    ChatView()
}





