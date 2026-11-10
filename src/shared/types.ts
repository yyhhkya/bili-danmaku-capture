export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export interface AuthMeResponse {
  authenticated: boolean
  expiresAt?: number
}

export interface LoginResponse {
  authenticated: boolean
  expiresAt: number
}
