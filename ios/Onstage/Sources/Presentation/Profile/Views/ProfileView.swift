import SwiftUI

/// Profile view
struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = ProfileViewModel()
    
    var body: some View {
        NavigationStack {
            List {
                // User info section
                Section {
                    if let user = appState.currentUser {
                        HStack(spacing: 16) {
                            // Avatar
                            Circle()
                                .fill(Color.accentColor.opacity(0.2))
                                .frame(width: 60, height: 60)
                                .overlay {
                                    if let avatarUrl = user.avatarUrl {
                                        AsyncImage(url: URL(string: avatarUrl)) { image in
                                            image
                                                .resizable()
                                                .aspectRatio(contentMode: .fill)
                                        } placeholder: {
                                            Image(systemName: "person.fill")
                                                .foregroundColor(.accentColor)
                                        }
                                        .clipShape(Circle())
                                    } else {
                                        Image(systemName: "person.fill")
                                            .font(.title)
                                            .foregroundColor(.accentColor)
                                    }
                                }
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(user.name ?? "用户")
                                    .font(.headline)
                                Text(user.email)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 8)
                    }
                }
                
                // Quota section
                Section("使用配额") {
                    if let user = appState.currentUser {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("本月已用")
                                Spacer()
                                Text("\(user.quotaUsed) / \(user.quotaTotal)")
                                    .foregroundColor(.secondary)
                            }
                            
                            ProgressView(value: user.quotaPercentUsed)
                                .tint(user.quotaPercentUsed > 0.8 ? .orange : .accentColor)
                            
                            if let resetAt = user.quotaResetAt {
                                Text("重置时间: \(resetAt.formatted())")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                
                // Settings section
                Section("设置") {
                    NavigationLink {
                        EditProfileView()
                    } label: {
                        Label("编辑资料", systemImage: "person.circle")
                    }
                    
                    NavigationLink {
                        NotificationSettingsView()
                    } label: {
                        Label("通知设置", systemImage: "bell")
                    }
                    
                    NavigationLink {
                        StorageSettingsView()
                    } label: {
                        Label("存储管理", systemImage: "internaldrive")
                    }
                }
                
                // Support section
                Section("支持") {
                    Link(destination: URL(string: "https://onstage.app/help")!) {
                        Label("帮助中心", systemImage: "questionmark.circle")
                    }
                    
                    Link(destination: URL(string: "https://onstage.app/feedback")!) {
                        Label("反馈建议", systemImage: "envelope")
                    }
                    
                    NavigationLink {
                        AboutView()
                    } label: {
                        Label("关于我们", systemImage: "info.circle")
                    }
                }
                
                // Logout
                Section {
                    Button(role: .destructive) {
                        appState.logout()
                    } label: {
                        HStack {
                            Spacer()
                            Text("退出登录")
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("我的")
        }
        .task {
            await viewModel.loadUser()
            appState.currentUser = viewModel.user
        }
    }
}

/// Edit profile view
struct EditProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    
    @State private var name: String = ""
    @State private var isSaving = false
    
    var body: some View {
        Form {
            Section("基本信息") {
                TextField("昵称", text: $name)
            }
            
            Section {
                Button {
                    Task {
                        await saveProfile()
                    }
                } label: {
                    HStack {
                        Spacer()
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("保存")
                        }
                        Spacer()
                    }
                }
                .disabled(isSaving)
            }
        }
        .navigationTitle("编辑资料")
        .onAppear {
            name = appState.currentUser?.name ?? ""
        }
    }
    
    private func saveProfile() async {
        isSaving = true
        
        do {
            let user = try await AuthRepository.shared.updateProfile(
                name: name.isEmpty ? nil : name,
                avatarUrl: nil
            )
            appState.currentUser = user
            dismiss()
        } catch {
            // Handle error
        }
        
        isSaving = false
    }
}

/// Notification settings view
struct NotificationSettingsView: View {
    @State private var generationComplete = true
    @State private var weeklyReport = false
    @State private var promotions = false
    
    var body: some View {
        Form {
            Section("推送通知") {
                Toggle("生成完成通知", isOn: $generationComplete)
                Toggle("每周使用报告", isOn: $weeklyReport)
                Toggle("优惠活动", isOn: $promotions)
            }
        }
        .navigationTitle("通知设置")
    }
}

/// Storage settings view
struct StorageSettingsView: View {
    @State private var cacheSize: String = "计算中..."
    
    var body: some View {
        Form {
            Section("缓存") {
                HStack {
                    Text("缓存大小")
                    Spacer()
                    Text(cacheSize)
                        .foregroundColor(.secondary)
                }
                
                Button("清除缓存") {
                    // Clear cache
                    cacheSize = "0 MB"
                }
            }
        }
        .navigationTitle("存储管理")
        .onAppear {
            // Calculate cache size
            cacheSize = "128 MB"
        }
    }
}

/// About view
struct AboutView: View {
    var body: some View {
        List {
            Section {
                VStack(spacing: 16) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 60))
                        .foregroundColor(.accentColor)
                    
                    Text("Onstage")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    Text("AI 时尚内容创作平台")
                        .foregroundColor(.secondary)
                    
                    Text("版本 1.0.0")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
            }
            
            Section {
                Link(destination: URL(string: "https://onstage.app/terms")!) {
                    Text("服务条款")
                }
                
                Link(destination: URL(string: "https://onstage.app/privacy")!) {
                    Text("隐私政策")
                }
            }
        }
        .navigationTitle("关于")
    }
}

#Preview {
    ProfileView()
        .environmentObject(AppState())
}





