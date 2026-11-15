import { apiRequest } from "./apiClient";

export const authApi = {
  // Step 1 of owner sign-in: send a code to the owner's email or mobile number.
  login: (otpChannel, identifier) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(
        otpChannel === "email"
          ? { otp_channel: "email", email: identifier }
          : { otp_channel: otpChannel, phone: identifier }, // "phone" (SMS) or "whatsapp"
      ),
    }),

  otpOptions: () => apiRequest("/auth/otp/options"),

  // Step 2 of owner sign-in: the 6-digit code sent by email or SMS.
  verifyCode: (challengeId, code) =>
    apiRequest("/auth/login/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, code }),
    }),

  resendCode: (challengeId) =>
    apiRequest("/auth/login/resend", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId }),
    }),

  startEmailChange: (email) =>
    apiRequest("/auth/email/change/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyEmailChange: (challengeId, code) =>
    apiRequest("/auth/email/change/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, code }),
    }),

  me: () => apiRequest("/auth/me"),

  async restoreSession() {
    try {
      return await apiRequest("/auth/me");
    } catch (error) {
      if (error.status !== 401) throw error;
      return apiRequest("/auth/refresh", { method: "POST" });
    }
  },

  logout: () => apiRequest("/auth/logout", { method: "POST" }),

  // Email + password sign-in (staff), alongside one-time codes.
  passwordLogin: (email, password, remember = true) =>
    apiRequest("/auth/password/login", {
      method: "POST",
      body: JSON.stringify({ email, password, remember }),
    }),
  passwordStatus: () => apiRequest("/auth/password/status"),
  setPassword: (newPassword, currentPassword, signOutOtherDevices = true) =>
    apiRequest("/auth/password/set", {
      method: "POST",
      body: JSON.stringify({
        new_password: newPassword,
        current_password: currentPassword || null,
        sign_out_other_devices: signOutOtherDevices,
      }),
    }),
  forgotPassword: (email) =>
    apiRequest("/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (challengeId, code, newPassword) =>
    apiRequest("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, code, new_password: newPassword }),
    }),
  logoutAll: () => apiRequest("/auth/logout-all", { method: "POST" }),
};
