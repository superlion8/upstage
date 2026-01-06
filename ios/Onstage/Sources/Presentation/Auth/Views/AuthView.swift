import SwiftUI

/// Auth view - Login/Register
struct AuthView: View {
    @EnvironmentObject var appState: AppState
    @State private var isLogin = true
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var isLoading = false
    @State private var error: String?
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                // Logo
                VStack(spacing: 16) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 60))
                        .foregroundColor(.accentColor)
                    
                    Text("Onstage")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("AI 时尚内容创作平台")
                        .foregroundColor(.secondary)
                }
                .padding(.top, 60)
                
                // Form
                VStack(spacing: 16) {
                    if !isLogin {
                        TextField("昵称", text: $name)
                            .textFieldStyle(AuthTextFieldStyle())
                    }
                    
                    TextField("邮箱", text: $email)
                        .textFieldStyle(AuthTextFieldStyle())
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    
                    SecureField("密码", text: $password)
                        .textFieldStyle(AuthTextFieldStyle())
                        .textContentType(isLogin ? .password : .newPassword)
                }
                .padding(.horizontal, 32)
                
                // Error message
                if let error = error {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                
                // Submit button
                Button {
                    Task {
                        await submit()
                    }
                } label: {
                    HStack {
                        if isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text(isLogin ? "登录" : "注册")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(canSubmit ? Color.accentColor : Color.gray)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!canSubmit || isLoading)
                .padding(.horizontal, 32)
                
                // Toggle login/register
                Button {
                    withAnimation {
                        isLogin.toggle()
                        error = nil
                    }
                } label: {
                    Text(isLogin ? "没有账号？注册" : "已有账号？登录")
                        .foregroundColor(.accentColor)
                }
                
                Spacer()
            }
        }
    }
    
    private var canSubmit: Bool {
        let validEmail = email.contains("@") && email.contains(".")
        let validPassword = password.count >= 8
        
        if isLogin {
            return validEmail && validPassword
        } else {
            return validEmail && validPassword
        }
    }
    
    private func submit() async {
        isLoading = true
        error = nil
        
        do {
            let user: User
            
            if isLogin {
                user = try await AuthRepository.shared.login(email: email, password: password)
            } else {
                user = try await AuthRepository.shared.register(
                    email: email,
                    password: password,
                    name: name.isEmpty ? nil : name
                )
            }
            
            appState.currentUser = user
            appState.isAuthenticated = true
            
        } catch {
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
}

/// Custom text field style
struct AuthTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    AuthView()
        .environmentObject(AppState())
}



